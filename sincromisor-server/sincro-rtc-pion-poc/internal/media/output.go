package media

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	pionmedia "github.com/pion/webrtc/v4/pkg/media"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
)

const (
	// SpeechQueueCapacity は既存発話をevictせず保持できる発話数である。
	SpeechQueueCapacity = 8
	// SpeechQueueSampleCapacity は48 kHz monoで120秒に相当するqueue上限である。
	SpeechQueueSampleCapacity = SampleRate * 120
	// SpeechLagAbortThreshold は実時間同期を失った発話を残りのmoraと共に破棄する遅延上限である。
	SpeechLagAbortThreshold = 250 * time.Millisecond
)

var (
	// ErrSpeechQueueFull はincoming発話を加えると件数またはsample上限を超えることを表す。
	ErrSpeechQueueFull = errors.New("speech queue is full")
)

type queuedSpeech struct {
	message      string
	speech       synthdecode.DecodedSpeech
	offset       int
	mora         int
	lastMoraSent int
}

// OutputStats はpayloadを保持しないoutbound queue/clockのsession累積観測値である。
type OutputStats struct {
	QueueRejected    uint64
	SilenceDropped   uint64
	SpeechAborted    uint64
	GenerationPurged uint64
}

// OutputProcessor は合成発話queue、Opus encoder、20 ms絶対deadline clockを所有する。
//
// Runはsession transport connected後に1回だけ開始し、context cancellation、codec/telop/track errorで
// 戻る。queueが空でもsilenceを送る。Purgeは未送信audioと、そのaudioから将来生成されるmora eventを
// 同時に破棄するが、既にtrackへ書いたaudioは巻き戻さない。
type OutputProcessor struct {
	mu            sync.Mutex
	sendMu        sync.Mutex
	queue         []*queuedSpeech
	queuedSamples int
	encoder       *FrameEncoder
	track         SampleWriter
	telop         TelopSink
	logger        *slog.Logger

	queueRejected    atomic.Uint64
	silenceDropped   atomic.Uint64
	speechAborted    atomic.Uint64
	generationPurged atomic.Uint64
}

// NewOutputProcessor はcodec、track、telop境界を検証してidle processorを返す。
//
// goroutineやtickerはRunまで開始しない。telopはnilでもよく、その場合audioだけを送る。
func NewOutputProcessor(
	encoder *FrameEncoder,
	track SampleWriter,
	telop TelopSink,
	logger *slog.Logger,
) (*OutputProcessor, error) {
	if encoder == nil || track == nil || logger == nil {
		return nil, errors.New("output processor dependencies must not be nil")
	}
	return &OutputProcessor{encoder: encoder, track: track, telop: telop, logger: logger}, nil
}

// Enqueue はdecode済み発話とdecode前resultのMessageをimmutable queue itemへまとめる。
//
// 追加後に8発話または120秒相当sampleを超える場合、incomingだけをErrSpeechQueueFullで拒否する。
// 既存発話はevictせず、8発話ちょうど、120秒ちょうどは受理する。
func (p *OutputProcessor) Enqueue(message string, speech synthdecode.DecodedSpeech) error {
	if len(speech.PCM) == 0 {
		return errors.New("decoded speech PCM length is invalid")
	}
	item := &queuedSpeech{
		message:      message,
		lastMoraSent: -1,
		speech: synthdecode.DecodedSpeech{
			SpeechID: speech.SpeechID,
			PCM:      append([]int16(nil), speech.PCM...),
			Mora:     append([]synthdecode.TimedMora(nil), speech.Mora...),
		},
	}
	p.mu.Lock()
	if len(p.queue)+1 > SpeechQueueCapacity ||
		p.queuedSamples+len(item.speech.PCM) > SpeechQueueSampleCapacity {
		p.mu.Unlock()
		count := p.queueRejected.Add(1)
		p.logger.Warn("rejected outbound speech",
			"queue", "speech", "action", "reject_incoming", "count", count,
		)
		return ErrSpeechQueueFull
	}
	p.queue = append(p.queue, item)
	p.queuedSamples += len(item.speech.PCM)
	p.mu.Unlock()
	return nil
}

// Purge はgeneration barrierより前に取り込んだ未送信発話をすべて破棄する。
func (p *OutputProcessor) Purge() {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	p.mu.Lock()
	count := len(p.queue)
	p.queue = nil
	p.queuedSamples = 0
	p.mu.Unlock()
	if count > 0 {
		total := p.generationPurged.Add(uint64(count))
		p.logger.Info("purged outbound speech",
			"queue", "speech", "action", "generation_purge", "count", total,
		)
	}
}

// Stats はoutbound processorのpayload非保持counter snapshotを返す。
func (p *OutputProcessor) Stats() OutputStats {
	return OutputStats{
		QueueRejected:    p.queueRejected.Load(),
		SilenceDropped:   p.silenceDropped.Load(),
		SpeechAborted:    p.speechAborted.Load(),
		GenerationPurged: p.generationPurged.Load(),
	}
}

// Close は未送信audio/moraを破棄する。Runの停止はsession context、encoder解放はFrameEncoder ownerが担う。
func (p *OutputProcessor) Close() error {
	p.Purge()
	return nil
}

// Run はsession所有のabsolute deadlineを20 msずつ進め、各deadlineで1 packetだけ送る。
//
// schedulerが遅れたsilence deadlineはまとめてdropし、burstで埋め戻さない。active speechのlagが
// 250 msを超えた場合は残audio/moraを破棄し、次deadlineから次発話を実時間隔で開始する。
func (p *OutputProcessor) Run(ctx context.Context) error {
	if ctx == nil {
		return errors.New("output processor context must not be nil")
	}
	nextDeadline := time.Now().Add(FrameDuration)
	timer := time.NewTimer(time.Until(nextDeadline))
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case now := <-timer.C:
			lag := now.Sub(nextDeadline)
			if p.hasActiveSpeech() && lag > SpeechLagAbortThreshold {
				p.abortCurrentSpeech(lag)
				nextDeadline = now.Add(FrameDuration)
				timer.Reset(time.Until(nextDeadline))
				continue
			}
			if !p.hasActiveSpeech() && lag >= FrameDuration {
				dropped := uint64(lag / FrameDuration)
				total := p.silenceDropped.Add(dropped)
				p.logger.Warn("dropped expired outbound silence",
					"queue", "audio", "action", "drop_expired_silence", "count", total,
				)
				nextDeadline = nextDeadline.Add(time.Duration(dropped) * FrameDuration)
			}
			if err := p.writeFrame(); err != nil {
				return err
			}
			nextDeadline = nextDeadline.Add(FrameDuration)
			delay := time.Until(nextDeadline)
			if delay < 0 {
				delay = 0
			}
			timer.Reset(delay)
		}
	}
}

func (p *OutputProcessor) hasActiveSpeech() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.queue) > 0
}

func (p *OutputProcessor) abortCurrentSpeech(lag time.Duration) {
	p.mu.Lock()
	if len(p.queue) == 0 {
		p.mu.Unlock()
		return
	}
	item := p.queue[0]
	p.queuedSamples -= len(item.speech.PCM) - item.offset
	p.queue = p.queue[1:]
	p.mu.Unlock()
	count := p.speechAborted.Add(1)
	p.logger.Warn("aborted lagged outbound speech",
		"queue", "speech", "action", "abort_lagged", "count", count, "lag_ms", lag.Milliseconds(),
	)
}

func (p *OutputProcessor) writeFrame() error {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	frame, telop := p.nextFrame()
	packet, err := p.encoder.Encode(frame)
	if err != nil {
		return err
	}
	if telop != nil && p.telop != nil {
		if err := p.telop(*telop); err != nil {
			return fmt.Errorf("enqueue outbound telop: %w", err)
		}
	}
	if err := p.track.WriteSample(pionmedia.Sample{Data: packet, Duration: FrameDuration}); err != nil {
		return fmt.Errorf("write outbound audio: %w", err)
	}
	return nil
}

// nextFrameはqueue itemの48 kHz sample位置をaudio frameとtelopの共通tickとして進める。
//
// frame内で始まるmoraは次frameまで切り替えず、frame開始sampleを含むactive moraだけを返す。
// 最終audio frameはsilence paddingするが、itemのsample accountingは実PCM分だけを消費する。
func (p *OutputProcessor) nextFrame() ([]int16, *TelopPayload) {
	p.mu.Lock()
	defer p.mu.Unlock()
	frame := make([]int16, frameSamples)
	if len(p.queue) == 0 {
		return frame, nil
	}
	item := p.queue[0]
	start := item.offset
	end := start + frameSamples
	if end > len(item.speech.PCM) {
		end = len(item.speech.PCM)
	}
	copy(frame, item.speech.PCM[start:end])
	var payload *TelopPayload
	for item.mora < len(item.speech.Mora) && item.speech.Mora[item.mora].EndSample <= uint64(start) {
		item.mora++
	}
	if item.mora < len(item.speech.Mora) {
		mora := item.speech.Mora[item.mora]
		if mora.StartSample <= uint64(start) && uint64(start) < mora.EndSample {
			newText := item.lastMoraSent != item.mora
			payload = &TelopPayload{
				SpeechID:  item.speech.SpeechID,
				Timestamp: float64(start) / SampleRate,
				Message:   item.message,
				Vowel:     stringValue(mora.Vowel),
				Text:      stringValue(mora.Text),
				Length:    float64(mora.EndSample-mora.StartSample) / SampleRate,
				NewText:   newText,
			}
			item.lastMoraSent = item.mora
		}
	}
	consumed := end - start
	item.offset = end
	p.queuedSamples -= consumed
	if item.offset == len(item.speech.PCM) {
		p.queue = p.queue[1:]
	}
	return frame, payload
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
