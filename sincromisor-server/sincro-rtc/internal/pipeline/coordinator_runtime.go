package pipeline

import (
	"errors"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// ConfigureRuntime はprocess recorderと所有Sessionのpanic callbackをStart前に設定する。
// 全workerが同一の不変な失敗境界を共有するため、Start後の再設定は拒否する。
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
