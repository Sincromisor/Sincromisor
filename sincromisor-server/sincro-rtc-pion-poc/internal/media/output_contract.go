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
// Pion adapterはDurationから実RTP timestampを進め、test trackはwraparoundを含む論理clockを検証する。
type OutputSample struct {
	MediaSample    pionmedia.Sample
	SamplePosition uint64
	RTPTimestamp   uint32
}

// TelopSink は対応audio frameを書き込む直前に生成済みtelop payloadを受理する。
type TelopSink func(TelopPayload) error

// outputEncoderはnative Opus実装と決定的test encoderを同じframe契約へ接続する内部境界である。
type outputEncoder interface {
	Encode([]int16) ([]byte, error)
}

// outputTimerはRunが所有する単発deadline timerの最小操作面である。
type outputTimer interface {
	C() <-chan time.Time
	Reset(time.Duration) bool
	Stop() bool
}

// outputClockはabsolute deadline計算をwall clockと決定的test clockで共有する内部境界である。
type outputClock interface {
	Now() time.Time
	NewTimer(time.Duration) outputTimer
}
