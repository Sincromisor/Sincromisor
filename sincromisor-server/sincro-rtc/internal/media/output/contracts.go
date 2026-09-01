package output

import (
	"time"

	pionmedia "github.com/pion/webrtc/v4/pkg/media"
)

// TelopPayload はaudio frame直前にtelop_chへ渡すFrontend wire schemaである。
//
// Timestampは発話開始からのframe開始秒、Lengthはactive moraの秒数である。VowelとTextは
// producerのnilを境界でempty stringへ変換済みで、NewTextは同じmoraの最初のframeだけtrueになる。
type TelopPayload struct {
	SpeechID int64 `json:"speech_id"` // SpeechIDは発話を識別する。
	// Timestampは発話先頭から現在の音声枠までの秒数である。
	Timestamp float64 `json:"timestamp"`
	Message   string  `json:"message"`  // Messageは発話に対応する表示文である。
	Vowel     string  `json:"vowel"`    // Vowelは現在のモーラの母音である。
	Text      string  `json:"text"`     // Textは現在のモーラの表示文字列である。
	Length    float64 `json:"length"`   // Lengthは現在のモーラの秒数である。
	NewText   bool    `json:"new_text"` // NewTextはモーラ先頭の音声枠だけ真になる。
}

// SampleWriter はOpus packetとRTP clock durationをPion outbound trackへ渡す境界である。
type SampleWriter interface {
	WriteSample(Sample) error
}

// Sample はencoded packetとsession clock上のsample位置をtrack境界へ渡す。
//
// SamplePositionはsession開始からの絶対48 kHz sample数、RTPTimestampはその下位32 bitである。
// MediaSample.PrevDroppedPacketsは直前の実packetから飛ばした20 ms slot数で、Pion adapterは
// timestampとsequence numberの両方へ同じgapを反映する。
type Sample struct {
	MediaSample pionmedia.Sample // MediaSampleはPionへ書き込む符号化済み音声である。
	// SamplePositionはセッション開始からの絶対サンプル位置である。
	SamplePosition uint64
	RTPTimestamp   uint32 // RTPTimestampはSamplePositionの下位32ビットである。
}

// TelopSink は対応audio frameを書き込む直前に生成済みtelop payloadを受理する。
type TelopSink func(TelopPayload) error

// Observer は1つのProcessorからペイロードを含まないキュー、時計、codec、frameイベントを受け取る。
// 実装は複数処理担当からの並行呼び出しに対応しなければならない。
type Observer interface {
	// AudioFrameは送信または破棄した音声枠を記録する。
	AudioFrame(direction, outcome string)
	// PacingLagは送信時刻の遅延秒数を記録する。
	PacingLag(seconds float64)
	// PacingAbortは遅延、世代更新、符号化失敗による破棄を記録する。
	PacingAbort(reason string)
	// CodecErrorは送信音声の符号化失敗を記録する。
	CodecError(direction string)
	// QueueDepthDeltaは発話キューの所有件数変化を記録する。
	QueueDepthDelta(queue string, delta float64)
	// QueueOverflowは発話キュー上限での拒否を記録する。
	QueueOverflow(queue, action string)
}

type discardObserver struct{}

func (discardObserver) AudioFrame(string, string)       {}
func (discardObserver) PacingLag(float64)               {}
func (discardObserver) PacingAbort(string)              {}
func (discardObserver) CodecError(string)               {}
func (discardObserver) QueueDepthDelta(string, float64) {}
func (discardObserver) QueueOverflow(string, string)    {}

// outputEncoderはnative Opus実装と決定的test encoderを同じframe契約へ接続する内部境界である。
type outputEncoder interface {
	Encode([]int16) ([]byte, error)
}

// timerはRunが所有する単発deadline timerの最小操作面である。
type timer interface {
	C() <-chan time.Time
	Reset(time.Duration) bool
	Stop() bool
}

// clockはabsolute deadline計算をwall clockと決定的integration clockで共有する。
type clock interface {
	Now() time.Time
	NewTimer(time.Duration) timer
}
