package media

import (
	"time"

	pionmedia "github.com/pion/webrtc/v4/pkg/media"
)

// TelopPayload はaudio frame直前にtelop_chへ渡すFrontend wire schemaである。
//
// Timestampは発話開始からのframe開始秒、Lengthはactive moraの秒数である。VowelとTextは
// producerのnilを境界でempty stringへ変換済みで、NewTextは同じmoraの最初のframeだけtrueになる。
type TelopPayload struct {
	SpeechID  int64   `json:"speech_id"`
	Timestamp float64 `json:"timestamp"`
	Message   string  `json:"message"`
	Vowel     string  `json:"vowel"`
	Text      string  `json:"text"`
	Length    float64 `json:"length"`
	NewText   bool    `json:"new_text"`
}

// SampleWriter はOpus packetとRTP clock durationをPion outbound trackへ渡す境界である。
type SampleWriter interface {
	WriteSample(OutputSample) error
}

// OutputSample はencoded packetとsession clock上のsample位置をtrack境界へ渡す。
//
// SamplePositionはsession開始からの絶対48 kHz sample数、RTPTimestampはその下位32 bitである。
// MediaSample.PrevDroppedPacketsは直前の実packetから飛ばした20 ms slot数で、Pion adapterは
// timestampとsequence numberの両方へ同じgapを反映する。
type OutputSample struct {
	MediaSample    pionmedia.Sample
	SamplePosition uint64
	RTPTimestamp   uint32
}

// TelopSink は対応audio frameを書き込む直前に生成済みtelop payloadを受理する。
type TelopSink func(TelopPayload) error

// OutputObserver receives payload-free queue, pacing, codec, and frame events
// from one OutputProcessor. Implementations must be concurrency-safe.
type OutputObserver interface {
	// AudioFrame records one sent or dropped outbound frame.
	AudioFrame(direction, outcome string)
	// PacingLag observes scheduler delay in seconds.
	PacingLag(seconds float64)
	// PacingAbort records lag/generation/codec queue abandonment.
	PacingAbort(reason string)
	// CodecError records an output encoding failure.
	CodecError(direction string)
	// QueueDepthDelta transfers ownership of queued speech items.
	QueueDepthDelta(queue string, delta float64)
	// QueueOverflow records rejection at the speech queue limit.
	QueueOverflow(queue, action string)
}

type discardOutputObserver struct{}

func (discardOutputObserver) AudioFrame(string, string)       {}
func (discardOutputObserver) PacingLag(float64)               {}
func (discardOutputObserver) PacingAbort(string)              {}
func (discardOutputObserver) CodecError(string)               {}
func (discardOutputObserver) QueueDepthDelta(string, float64) {}
func (discardOutputObserver) QueueOverflow(string, string)    {}

// outputEncoderはnative Opus実装と決定的test encoderを同じframe契約へ接続する内部境界である。
type outputEncoder interface {
	Encode([]int16) ([]byte, error)
}

// OutputTimerはRunが所有する単発deadline timerの最小操作面である。
type OutputTimer interface {
	C() <-chan time.Time
	Reset(time.Duration) bool
	Stop() bool
}

// OutputClockはabsolute deadline計算をwall clockと決定的integration clockで共有する。
type OutputClock interface {
	Now() time.Time
	NewTimer(time.Duration) OutputTimer
}
