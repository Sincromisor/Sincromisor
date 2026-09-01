// Package pipeline は4つのPython音声サービスを再生成可能な世代として統合する。
package pipeline

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
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

// RecognizerClient はExtractorResultと認識result/event streamのgeneration側境界である。
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

// Observer はpayloadを含まない再接続結果と入力queue所有権の変化を受け取る。
// 実装はservice、result、queue、actionのlabelを正規化しなければならない。
type Observer interface {
	// PipelineReconnect は固定serviceごとのlifecycle結果を記録する。
	PipelineReconnect(service, result string)
	// QueueDepthDelta は入力の追加、取得、破棄、終了に伴う所有権移動を記録する。
	QueueDepthDelta(queue string, delta float64)
	// QueueOverflow は入力queue満杯時に適用した固定方針を記録する。
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
