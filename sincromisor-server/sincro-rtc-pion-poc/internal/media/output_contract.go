package media

import pionmedia "github.com/pion/webrtc/v4/pkg/media"

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
	WriteSample(pionmedia.Sample) error
}

// TelopSink は対応audio frameを書き込む直前に生成済みtelop payloadを受理する。
type TelopSink func(TelopPayload) error
