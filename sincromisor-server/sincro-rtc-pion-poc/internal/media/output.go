package media

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
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
	// ErrOutputClosed はclose開始後のenqueueまたはframe送信を拒否したことを表す。
	ErrOutputClosed = errors.New("output processor is closed")
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
	QueuedSpeeches   int
	QueuedSamples    int
	Closed           bool
}

// OutputProcessor は合成発話queue、Opus encoder、20 ms絶対deadline clockを所有する。
//
// Runはsession transport connected後に1回だけ開始し、context cancellation、codec/telop/track error、
// またはPionのuint16で表現不能な連続drop数で戻る。queueが空でもsilenceを送る。Purgeは未送信audioと、
// そのaudioから将来生成されるmora eventを同時に破棄するが、既にtrackへ書いたaudioは巻き戻さない。
type OutputProcessor struct {
	mu             sync.Mutex
	sendMu         sync.Mutex
	queue          []*queuedSpeech
	queuedSamples  int
	encoder        outputEncoder
	track          SampleWriter
	telop          TelopSink
	logger         *slog.Logger
	clock          OutputClock
	samplePosition uint64
	pendingDrops   uint64
	closed         bool
	observer       OutputObserver

	queueRejected    atomic.Uint64
	silenceDropped   atomic.Uint64
	speechAborted    atomic.Uint64
	generationPurged atomic.Uint64
}

// NewOutputProcessor はcodec、track、telop境界を検証してidle processorを返す。
//
// goroutineやtickerはRunまで開始しない。telopはnilでもよく、その場合audioだけを送る。
// observerは任意で、未指定または先頭がnilならeventを破棄する。複数指定時は既存callerとの
// optional互換境界として先頭だけを使用し、processorはpayload-free eventを同期通知する。
func NewOutputProcessor(
	encoder *FrameEncoder,
	track SampleWriter,
	telop TelopSink,
	logger *slog.Logger,
	observers ...OutputObserver,
) (*OutputProcessor, error) {
	return newOutputProcessorWithHooks(encoder, track, telop, logger, systemOutputClock{}, 0, observers...)
}

// NewOutputProcessorWithClockはproduction trackを決定的clockで検証するintegration境界である。
//
// runtimeはNewOutputProcessorを使う。clockはRun開始後に交換してはならない。
// observerの未指定/nil/複数指定semanticsと同期通知の副作用はNewOutputProcessorと同じである。
func NewOutputProcessorWithClock(
	encoder *FrameEncoder,
	track SampleWriter,
	telop TelopSink,
	logger *slog.Logger,
	clock OutputClock,
	observers ...OutputObserver,
) (*OutputProcessor, error) {
	return newOutputProcessorWithHooks(encoder, track, telop, logger, clock, 0, observers...)
}

// newOutputProcessorWithHooksはproductionと決定的clock testで共有する依存組み立て境界である。
// observersを単一のimmutable observerへ正規化し、Run中のqueue/pacing/codec/audio eventが
// constructor後に別ownerへ切り替わらないようにする。
func newOutputProcessorWithHooks(
	encoder outputEncoder,
	track SampleWriter,
	telop TelopSink,
	logger *slog.Logger,
	clock OutputClock,
	samplePosition uint64,
	observers ...OutputObserver,
) (*OutputProcessor, error) {
	if encoder == nil || track == nil || logger == nil || clock == nil {
		return nil, errors.New("output processor dependencies must not be nil")
	}
	var observer OutputObserver = discardOutputObserver{}
	if len(observers) > 0 && observers[0] != nil {
		observer = observers[0]
	}
	return &OutputProcessor{
		encoder: encoder, track: track, telop: telop, logger: logger,
		clock: clock, samplePosition: samplePosition, observer: observer,
	}, nil
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
	if p.closed {
		p.mu.Unlock()
		return ErrOutputClosed
	}
	if len(p.queue)+1 > SpeechQueueCapacity ||
		p.queuedSamples+len(item.speech.PCM) > SpeechQueueSampleCapacity {
		p.mu.Unlock()
		count := p.queueRejected.Add(1)
		p.logger.Warn("rejected outbound speech",
			"stage", "speech_queue", "reason", "output_backpressure", "count", count,
		)
		p.observer.QueueOverflow("speech", "reject_close")
		return ErrSpeechQueueFull
	}
	p.queue = append(p.queue, item)
	p.queuedSamples += len(item.speech.PCM)
	p.observer.QueueDepthDelta("speech", 1)
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
		p.observer.QueueDepthDelta("speech", -float64(count))
		p.observer.PacingAbort("generation")
		total := p.generationPurged.Add(uint64(count))
		p.logger.Info("purged outbound speech",
			"stage", "speech_queue", "reason", "generation", "count", total,
		)
	}
}

// Stats はoutbound processorのpayload非保持counter snapshotを返す。
func (p *OutputProcessor) Stats() OutputStats {
	p.mu.Lock()
	queuedSpeeches, queuedSamples, closed := len(p.queue), p.queuedSamples, p.closed
	p.mu.Unlock()
	return OutputStats{
		QueueRejected:    p.queueRejected.Load(),
		SilenceDropped:   p.silenceDropped.Load(),
		SpeechAborted:    p.speechAborted.Load(),
		GenerationPurged: p.generationPurged.Load(),
		QueuedSpeeches:   queuedSpeeches,
		QueuedSamples:    queuedSamples,
		Closed:           closed,
	}
}

// Close は未送信audio/moraを破棄する。Runの停止はsession context、encoder解放はFrameEncoder ownerが担う。
func (p *OutputProcessor) Close() error {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	p.mu.Lock()
	count := len(p.queue)
	p.closed = true
	p.queue = nil
	p.queuedSamples = 0
	p.mu.Unlock()
	if count > 0 {
		p.observer.QueueDepthDelta("speech", -float64(count))
	}
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

func (p *OutputProcessor) hasActiveSpeech() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.queue) > 0
}

// skipSamplePositionsは送らない20 ms slotをlogical clockと次Pion sampleのdrop metadataへ累積する。
//
// 連続するskipは最初の成功writeまで保持し、timestamp/sequence gapを複数packetへ分割しない。
func (p *OutputProcessor) skipSamplePositions(frames uint64) {
	p.mu.Lock()
	p.samplePosition += frames * frameSamples
	p.pendingDrops += frames
	p.mu.Unlock()
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
	p.observer.QueueDepthDelta("speech", -1)
	p.observer.PacingAbort("lag")
	count := p.speechAborted.Add(1)
	p.logger.Warn("aborted lagged outbound speech",
		"stage", "speech_queue", "reason", "pacing_lag", "count", count,
	)
}

func (p *OutputProcessor) writeFrame() error {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return ErrOutputClosed
	}
	samplePosition := p.samplePosition
	pendingDrops := p.pendingDrops
	p.mu.Unlock()
	if pendingDrops > math.MaxUint16 {
		return fmt.Errorf("outbound dropped slot count %d exceeds Pion packetizer limit", pendingDrops)
	}
	frame, telop := p.nextFrame()
	packet, err := p.encoder.Encode(frame)
	if err != nil {
		p.observer.CodecError("encode_out")
		p.observer.PacingAbort("codec")
		return err
	}
	if telop != nil && p.telop != nil {
		if err := p.telop(*telop); err != nil {
			return fmt.Errorf("enqueue outbound telop: %w", err)
		}
	}
	if err := p.track.WriteSample(OutputSample{
		MediaSample: pionmedia.Sample{
			Data: packet, Duration: FrameDuration, PrevDroppedPackets: uint16(pendingDrops),
		},
		SamplePosition: samplePosition,
		RTPTimestamp:   uint32(samplePosition),
	}); err != nil {
		return fmt.Errorf("write outbound audio: %w", err)
	}
	p.observer.AudioFrame("out", "sent")
	// Pionがdrop metadataを受理した成功点だけでpending countを消費する。
	// track error時はRunが終了するため、不完全なclock stateで次packetを送らない。
	p.mu.Lock()
	p.pendingDrops = 0
	p.samplePosition += frameSamples
	p.mu.Unlock()
	return nil
}

type systemOutputClock struct{}

func (systemOutputClock) Now() time.Time { return time.Now() }
func (systemOutputClock) NewTimer(delay time.Duration) OutputTimer {
	return systemOutputTimer{Timer: time.NewTimer(delay)}
}

type systemOutputTimer struct {
	*time.Timer
}

func (t systemOutputTimer) C() <-chan time.Time { return t.Timer.C }

// nextFrameはqueue itemの48 kHz sample位置をaudio frameとtelopの共通tickとして進める。
//
// frame内で始まるmoraは次frameまで切り替えず、frame開始sampleを含むactive moraだけを返す。
// 最終audio frameはsilence paddingするが、itemのsample accountingは実PCM分だけを消費する。
func (p *OutputProcessor) nextFrame() ([]int16, *TelopPayload) {
	p.mu.Lock()
	frame := make([]int16, frameSamples)
	if len(p.queue) == 0 {
		p.mu.Unlock()
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
		p.mu.Unlock()
		p.observer.QueueDepthDelta("speech", -1)
		return frame, payload
	}
	p.mu.Unlock()
	return frame, payload
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
