// Package pipeline coordinates the four Python audio services as one resettable generation.
package pipeline

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

const (
	// RetryMin は最初の再接続attemptに適用するfull-jitter capである。
	RetryMin = time.Second
	// RetryMax はattempt 5以降に適用し、duration overflowを防ぐfull-jitter capである。
	RetryMax           = 30 * time.Second
	outputBackpressure = 5 * time.Second
)

var (
	// ErrPipelineUnavailable はrunning以外で入力が保存されなかったことを表す。
	ErrPipelineUnavailable = errors.New("pipeline is unavailable")
	// ErrAlreadyStarted は同じCoordinatorを再利用しようとしたことを表す。
	ErrAlreadyStarted = errors.New("pipeline already started")
	// ErrClosed はclosed確定後のStartまたは初回接続中の明示Closeを表す。
	ErrClosed = errors.New("pipeline is closed")
)

// ExtractorClient はPCM送信とExtractor result/event streamのgeneration側境界である。
type ExtractorClient = pclient.ExtractorConnection

// RecognizerClient は結合済みExtractorResultと認識result/event streamのgeneration側境界である。
type RecognizerClient = pclient.RecognizerConnection

// ProcessorClient はhistory付きrequestとstreaming result/eventのgeneration側境界である。
type ProcessorClient = pclient.ProcessorConnection

// SynthesizerClient はProcessor raw bytesとencoded voice result/eventのgeneration側境界である。
type SynthesizerClient = pclient.SynthesizerConnection

// ClientSet は同じattemptで作られ、公開と逆順Closeを一括で行う4 clientの所有境界である。
type ClientSet = pclient.Set

// ClientSetFactory はattemptごとに再利用不能な新しいClientSetを接続する。
//
// partial setを返さず、失敗時は作成済みclientをfactory内でjoinする。
type ClientSetFactory = pclient.SetFactory

// Output はexternal consumerがreset後の適用可否を識別するgeneration envelopeである。
type Output[T any] struct {
	// Generation はValueを生成したclient setとtransient stateの識別子である。
	Generation uint64
	// Value は順序を維持して公開されたtextまたはencoded voice resultである。
	Value T
}

type jitterSource func(time.Duration) (time.Duration, error)
type retryWaiter func(context.Context, time.Duration) <-chan error

// Observer receives payload-free reconnect and input-queue ownership events.
// Implementations must normalize service/result/queue/action labels.
type Observer interface {
	// PipelineReconnect records a lifecycle result for one fixed service.
	PipelineReconnect(service, result string)
	// QueueDepthDelta transfers ownership on input enqueue, dequeue, purge, or close.
	QueueDepthDelta(queue string, delta float64)
	// QueueOverflow records the fixed policy chosen when the input queue is full.
	QueueOverflow(queue, action string)
}

type discardObserver struct{}

func (discardObserver) PipelineReconnect(string, string) {}
func (discardObserver) QueueDepthDelta(string, float64)  {}
func (discardObserver) QueueOverflow(string, string)     {}

// Coordinator は1 sessionの4 client、generation、transient work、confirmed history、
// Extractor identity、およびqueue交換を跨ぐdrop telemetryを所有する。
//
// Start contextがlifetimeを所有し、Closeはstable result channelを閉じる前に全producerをjoinする。
// 別sessionを開始するcallerは新しいCoordinatorを作る。
type Coordinator struct {
	factory      ClientSetFactory
	logger       *slog.Logger
	jitter       jitterSource
	wait         retryWaiter
	observer     Observer
	panicHandler func(stage string)

	mu         sync.Mutex
	outputMu   sync.Mutex
	state      State
	generation uint64
	started    bool
	sessionID  string
	talkMode   string
	sessionCtx context.Context
	cancel     context.CancelFunc
	set        ClientSet
	work       *generationWork
	history    []protocol.ChatMessage
	extraction extractionIdentity
	pcmDrops   uint64
	staleDrops map[pclient.Service]uint64
	resetting  bool
	closeDone  chan struct{}
	closeOnce  sync.Once

	textOut           chan Output[protocol.ChatMessage]
	synthOut          chan Output[protocol.SynthesizerResult]
	generationChanges chan uint64
	wg                sync.WaitGroup
}

type generationWork struct {
	number uint64
	ctx    context.Context
	cancel context.CancelFunc
	input  *frameQueue
	conv   *conversation
	wg     sync.WaitGroup
}

// NewCoordinator はdependencyを検証し、固定queue / timeoutを持つidle Coordinatorを返す。
//
// network I/OやgoroutineはStartまで開始しない。nil dependencyとzero valueは使用できない。
func NewCoordinator(factory ClientSetFactory, logger *slog.Logger) (*Coordinator, error) {
	return newCoordinatorWithHooks(factory, logger, cryptoJitter, realWait)
}

func newCoordinatorWithHooks(factory ClientSetFactory, logger *slog.Logger, jitter jitterSource, waiter retryWaiter) (*Coordinator, error) {
	if factory == nil || logger == nil || jitter == nil || waiter == nil {
		return nil, errors.New("pipeline coordinator dependencies must not be nil")
	}
	return &Coordinator{
		factory: factory, logger: logger, jitter: jitter, wait: waiter, state: StateIdle,
		textOut:           make(chan Output[protocol.ChatMessage], outputQueueCapacity),
		synthOut:          make(chan Output[protocol.SynthesizerResult], outputQueueCapacity),
		generationChanges: make(chan uint64, 1),
		staleDrops:        make(map[pclient.Service]uint64),
		closeDone:         make(chan struct{}),
		observer:          discardObserver{},
		panicHandler:      func(string) {},
	}, nil
}

// ConfigureRuntime installs the process recorder and owning Session panic
// callback before Start. Reconfiguration after Start is rejected so all
// first-party workers share one immutable failure boundary.
func (c *Coordinator) ConfigureRuntime(observer Observer, panicHandler func(stage string)) error {
	if observer == nil || panicHandler == nil {
		return errors.New("pipeline runtime hooks must not be nil")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.started {
		return errors.New("pipeline runtime hooks cannot change after start")
	}
	c.observer = observer
	c.panicHandler = panicHandler
	return nil
}

// Start は4 serviceが同じgenerationで揃うまで同期的に接続し、成功後にnilを返す。
//
// ctxはsession lifetimeを所有する。二重StartはErrAlreadyStarted、明示Closeと競合した初回接続は
// ErrClosed、caller cancellationはctx.Errを返す。
func (c *Coordinator) Start(ctx context.Context, sessionID, talkMode string) error {
	if ctx == nil || sessionID == "" || (talkMode != "chat" && talkMode != "sincro") {
		return errors.New("pipeline start arguments are invalid")
	}
	c.mu.Lock()
	if c.state == StateClosed {
		c.mu.Unlock()
		return ErrClosed
	}
	if c.started {
		c.mu.Unlock()
		return ErrAlreadyStarted
	}
	c.started = true
	c.sessionID, c.talkMode, c.generation = sessionID, talkMode, 1
	c.sessionCtx, c.cancel = context.WithCancel(ctx)
	if err := c.transitionLocked(StateConnecting); err != nil {
		c.mu.Unlock()
		return err
	}
	c.wg.Add(1)
	c.goCoordinator("pipeline_context", c.closeOnContext)
	c.mu.Unlock()

	err := c.connectUntilRunning(true)
	if err != nil {
		if ctx.Err() != nil {
			_ = c.Close()
			return ctx.Err()
		}
		return err
	}
	return nil
}

func (c *Coordinator) closeOnContext() {
	<-c.sessionCtx.Done()
	// Close waits for every session goroutine, so a separate caller performs the
	// join after this context watcher has left the wait group.
	c.goDetached("pipeline_close", func() { _ = c.Close() })
}

// SubmitPCM は20 ms / 16 kHz / mono / s16leの640-byte PCMを防御的copyして受理する。
//
// running以外はErrPipelineUnavailableで保存しない。満杯時は最古の未送信frameを捨てて最新を保持し、
// reset時はqueue objectを交換してcaller sliceと旧producerを切り離す。frameQueueがenqueue、
// dequeue、closeとinput gaugeを同じmutexで所有し、Coordinatorはoverflowのsession累積log countだけを
// 所有する。payloadはtelemetry/log境界へ渡さない。
func (c *Coordinator) SubmitPCM(frame []byte) error {
	if len(frame) != pcmFrameBytes {
		return errors.New("pipeline PCM frame must be exactly 640 bytes")
	}
	c.mu.Lock()
	if c.state != StateRunning || c.work == nil {
		c.mu.Unlock()
		return ErrPipelineUnavailable
	}
	queue := c.work.input
	owned := append([]byte(nil), frame...)
	dropped := queue.push(owned)
	if dropped {
		c.pcmDrops++
	}
	dropCount := c.pcmDrops
	c.mu.Unlock()
	if dropped {
		c.logger.Warn("dropped pipeline input", "stage", pclient.ServiceExtractor, "reason", "queue_overflow", "count", dropCount)
	}
	return nil
}

func (c *Coordinator) goCoordinator(stage string, run func()) {
	go func() {
		defer c.wg.Done()
		defer func() {
			if recover() != nil {
				c.panicHandler(stage)
			}
		}()
		run()
	}()
}

func (c *Coordinator) goWork(work *generationWork, stage string, run func()) {
	go func() {
		defer work.wg.Done()
		defer func() {
			if recover() != nil {
				c.panicHandler(stage)
			}
		}()
		run()
	}()
}

func (c *Coordinator) goDetached(stage string, run func()) {
	go func() {
		defer func() {
			if recover() != nil {
				c.panicHandler(stage)
			}
		}()
		run()
	}()
}

func (c *Coordinator) safeCallback(stage string, run func()) {
	defer func() {
		if recover() != nil {
			c.panicHandler(stage)
		}
	}()
	run()
}

// TextResults はuser/processor textを順序どおり返すsession lifetime channelである。
//
// 要素はgeneration付きで、Coordinatorだけが全producer join後にcloseする。
func (c *Coordinator) TextResults() <-chan Output[protocol.ChatMessage] { return c.textOut }

// SynthResults はcontainer decode前のencoded voiceとmora timingを発話順に返す。
//
// session lifetime channelはresetしても交換せず、Coordinatorだけがcloseする。
func (c *Coordinator) SynthResults() <-chan Output[protocol.SynthesizerResult] { return c.synthOut }

// GenerationChanges は初回running generationとreset advanceを単調増加で通知する。
//
// capacity 1の通知は未読の旧値を最新値へcoalesceするためbroadcastではなく、sessionは単一consumerで
// 受けてaudio/text/telopへ一括適用する。Coordinatorだけが全producer join後にcloseする。
func (c *Coordinator) GenerationChanges() <-chan uint64 { return c.generationChanges }

// Close はclosedを先に確定し、retry、generation、4 clientをcancel / joinして再接続を禁止する。
//
// 全producer終了後、publication/resetと共有するoutput barrier内でtext、synth、generationの順にchannelをcloseする。
// Close開始前にpublishへ入ったpackage内callerもbarrierから退出するまで待つため、全stateから
// idempotentかつsend/close raceなしで呼べる。
func (c *Coordinator) Close() error {
	c.closeOnce.Do(func() {
		c.mu.Lock()
		if c.state != StateClosed {
			_ = c.transitionLocked(StateClosed)
		}
		cancel, work, set := c.cancel, c.work, c.set
		c.work, c.set = nil, nil
		c.mu.Unlock()
		if cancel != nil {
			cancel()
		}
		if work != nil {
			work.cancel()
			work.input.close()
		}
		if set != nil {
			_ = set.Close()
		}
		if work != nil {
			work.wg.Wait()
		}
		c.wg.Wait()
		// generation workerのjoinは通常producerを全て覆う。それに加えてoutputMuを
		// channel closeの最終barrierにすることで、test hookを含むpackage内の直接
		// publicationがClose開始時点で進行中でもsend/closeを直列化する。
		c.outputMu.Lock()
		close(c.textOut)
		close(c.synthOut)
		close(c.generationChanges)
		c.outputMu.Unlock()
		close(c.closeDone)
	})
	<-c.closeDone
	return nil
}

func (c *Coordinator) transitionLocked(to State) error {
	if !validTransition(c.state, to) {
		err := &TransitionError{From: c.state, To: to}
		c.logger.Error("rejected pipeline state transition", "stage", "pipeline_state", "reason", "invalid_transition")
		return err
	}
	c.state = to
	return nil
}
