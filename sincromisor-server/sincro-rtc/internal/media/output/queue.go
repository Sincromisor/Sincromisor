package output

import (
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
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

// Stats はpayloadを保持しないoutbound queue/clockのsession累積観測値である。
type Stats struct {
	QueueRejected    uint64 // QueueRejectedは上限超過で拒否した発話数である。
	SilenceDropped   uint64 // SilenceDroppedは遅延により書かなかった無音枠数である。
	SpeechAborted    uint64 // SpeechAbortedは遅延により中断した発話数である。
	GenerationPurged uint64 // GenerationPurgedは世代更新により破棄した発話数である。
	QueuedSpeeches   int    // QueuedSpeechesは未送信発話数である。
	QueuedSamples    int    // QueuedSamplesは未送信PCMサンプル数である。
	Closed           bool   // Closedは追加と送信を終了済みかを表す。
}

// Processor は合成発話queue、Opus encoder、20 ms絶対deadline clockを所有する。
//
// Runはsession transport connected後に1回だけ開始し、context cancellation、codec/telop/track error、
// またはPionのuint16で表現不能な連続drop数で戻る。queueが空でもsilenceを送る。Purgeは未送信audioと、
// そのaudioから将来生成されるmora eventを同時に破棄するが、既にtrackへ書いたaudioは巻き戻さない。
// TelopSinkは後段のDataChannelキューへの受け渡し境界であり、Processorはその配送を所有しない。
type Processor struct {
	mu             sync.Mutex
	sendMu         sync.Mutex
	queue          []*queuedSpeech
	queuedSamples  int
	encoder        outputEncoder
	track          SampleWriter
	telop          TelopSink
	logger         *slog.Logger
	clock          clock
	samplePosition uint64
	pendingDrops   uint64
	closed         bool
	observer       Observer

	queueRejected    atomic.Uint64
	silenceDropped   atomic.Uint64
	speechAborted    atomic.Uint64
	generationPurged atomic.Uint64
}

// New はcodec、track、telop境界を検証してidle Processorを返す。
//
// goroutineやtickerはRunまで開始しない。telopはnilでもよく、その場合audioだけを送る。
// observerは任意で、未指定または先頭がnilならeventを破棄する。複数指定時は既存callerとの
// optional互換境界として先頭だけを使用し、processorはpayload-free eventを同期通知する。
func New(
	encoder *Encoder,
	track SampleWriter,
	telop TelopSink,
	logger *slog.Logger,
	observers ...Observer,
) (*Processor, error) {
	return newProcessorWithHooks(encoder, track, telop, logger, systemOutputClock{}, 0, observers...)
}

// newWithClockはproduction trackを決定的clockで検証する試験境界である。
func newWithClock(
	encoder *Encoder,
	track SampleWriter,
	telop TelopSink,
	logger *slog.Logger,
	clock clock,
	observers ...Observer,
) (*Processor, error) {
	return newProcessorWithHooks(encoder, track, telop, logger, clock, 0, observers...)
}

// newProcessorWithHooksはproductionと決定的clock testで共有する依存組み立て境界である。
// observersを単一のimmutable observerへ正規化し、Run中のqueue/pacing/codec/audio eventが
// constructor後に別ownerへ切り替わらないようにする。
func newProcessorWithHooks(
	encoder outputEncoder,
	track SampleWriter,
	telop TelopSink,
	logger *slog.Logger,
	clock clock,
	samplePosition uint64,
	observers ...Observer,
) (*Processor, error) {
	if encoder == nil || track == nil || logger == nil || clock == nil {
		return nil, errors.New("output processor dependencies must not be nil")
	}
	var observer Observer = discardObserver{}
	if len(observers) > 0 && observers[0] != nil {
		observer = observers[0]
	}
	return &Processor{
		encoder: encoder, track: track, telop: telop, logger: logger,
		clock: clock, samplePosition: samplePosition, observer: observer,
	}, nil
}

// Enqueue はdecode済み発話とdecode前resultのMessageをimmutable queue itemへまとめる。
//
// 追加後に8発話または120秒相当sampleを超える場合、incomingだけをErrSpeechQueueFullで拒否する。
// 既存発話はevictせず、8発話ちょうど、120秒ちょうどは受理する。
func (p *Processor) Enqueue(message string, speech synthdecode.DecodedSpeech) error {
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
func (p *Processor) Purge() {
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
func (p *Processor) Stats() Stats {
	p.mu.Lock()
	queuedSpeeches, queuedSamples, closed := len(p.queue), p.queuedSamples, p.closed
	p.mu.Unlock()
	return Stats{
		QueueRejected:    p.queueRejected.Load(),
		SilenceDropped:   p.silenceDropped.Load(),
		SpeechAborted:    p.speechAborted.Load(),
		GenerationPurged: p.generationPurged.Load(),
		QueuedSpeeches:   queuedSpeeches,
		QueuedSamples:    queuedSamples,
		Closed:           closed,
	}
}

// Close は未送信audio/moraを破棄する。Runの停止はsession context、encoder解放はEncoder ownerが担う。
func (p *Processor) Close() error {
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
