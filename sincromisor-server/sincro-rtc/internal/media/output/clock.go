package output

import (
	"context"
	"errors"
	"time"
)

// Run はsession所有のabsolute deadlineを20 msずつ進め、各deadlineで1 packetだけ送る。
//
// schedulerが遅れたsilence deadlineはまとめてdropし、burstで埋め戻さない。active speechのlagが
// 250 msを超えた場合は残audio/moraを破棄し、次deadlineから次発話を実時間隔で開始する。
func (p *Processor) Run(ctx context.Context) error {
	if ctx == nil {
		return errors.New("output processor context must not be nil")
	}
	nextDeadline := p.clock.Now().Add(FrameDuration)
	timer := p.clock.NewTimer(FrameDuration)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case now := <-timer.C():
			lag := now.Sub(nextDeadline)
			if lag > 0 {
				p.observer.PacingLag(lag.Seconds())
			}
			if p.hasActiveSpeech() && lag > SpeechLagAbortThreshold {
				// 遅れた発話をburst送信せずitem単位で捨てる。lag内の期限切れslotに加え、
				// abort分岐で書かない現在deadlineの1 slotも進める。次itemはnowから
				// 20 ms後に開始し、次packetのRTP gapを実際のno-write数と一致させる。
				p.abortCurrentSpeech(lag)
				p.skipSamplePositions(uint64(lag/FrameDuration) + 1)
				nextDeadline = now.Add(FrameDuration)
				timer.Reset(nextDeadline.Sub(p.clock.Now()))
				continue
			}
			if p.hasActiveSpeech() && lag >= FrameDuration {
				// abort閾値内のscheduler遅延も送信済みpacketで埋め戻さない。
				// RTP clock上の期限切れ位置を飛ばし、この1 packetだけをnowへ再同期する。
				p.skipSamplePositions(uint64(lag / FrameDuration))
				nextDeadline = now
			} else if !p.hasActiveSpeech() && lag >= FrameDuration {
				dropped := uint64(lag / FrameDuration)
				p.skipSamplePositions(dropped)
				for range dropped {
					p.observer.AudioFrame("out", "dropped")
				}
				total := p.silenceDropped.Add(dropped)
				p.logger.Warn("dropped expired outbound silence",
					"stage", "outbound_audio", "reason", "pacing_lag", "count", total,
				)
				nextDeadline = nextDeadline.Add(time.Duration(dropped) * FrameDuration)
			}
			if err := p.writeFrame(); err != nil {
				return err
			}
			nextDeadline = nextDeadline.Add(FrameDuration)
			delay := nextDeadline.Sub(p.clock.Now())
			if delay < 0 {
				delay = 0
			}
			timer.Reset(delay)
		}
	}
}

func (p *Processor) hasActiveSpeech() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.queue) > 0
}

// skipSamplePositionsは送らない20 ms slotをlogical clockと次Pion sampleのdrop metadataへ累積する。
//
// 連続するskipは最初の成功writeまで保持し、timestamp/sequence gapを複数packetへ分割しない。
func (p *Processor) skipSamplePositions(frames uint64) {
	p.mu.Lock()
	p.samplePosition += frames * frameSamples
	p.pendingDrops += frames
	p.mu.Unlock()
}

func (p *Processor) abortCurrentSpeech(lag time.Duration) {
	p.mu.Lock()
	if len(p.queue) == 0 {
		p.mu.Unlock()
		return
	}
	item := p.queue[0]
	p.queuedSamples -= len(item.speech.PCM) - item.offset
	p.queue = p.queue[1:]
	p.mu.Unlock()
	p.observer.QueueDepthDelta("speech", -1)
	p.observer.PacingAbort("lag")
	count := p.speechAborted.Add(1)
	p.logger.Warn("aborted lagged outbound speech",
		"stage", "speech_queue", "reason", "pacing_lag", "count", count,
	)
}

type systemOutputClock struct{}

func (systemOutputClock) Now() time.Time { return time.Now() }
func (systemOutputClock) NewTimer(delay time.Duration) timer {
	return systemOutputTimer{Timer: time.NewTimer(delay)}
}

type systemOutputTimer struct {
	*time.Timer
}

func (t systemOutputTimer) C() <-chan time.Time { return t.Timer.C }
