package synthdecode

import "fmt"

// ErrorKind は DecodeError の安定した失敗分類である。
type ErrorKind string

const (
	// ErrorUnsupported は許可matrix外のMIME typeを表す。
	ErrorUnsupported ErrorKind = "unsupported"
	// ErrorInvalid は空、非finite timing、壊れたPCM表現などの入力不正を表す。
	ErrorInvalid ErrorKind = "invalid"
	// ErrorLimit はencoded byte数、decoded sample数、発話時間の上限超過を表す。
	ErrorLimit ErrorKind = "limit"
	// ErrorTimeout はDecoder自身の5秒deadline超過を表す。
	ErrorTimeout ErrorKind = "timeout"
	// ErrorProcess はFFmpegの起動またはcontainer/codec decode失敗を表す。
	ErrorProcess ErrorKind = "process"
)

// DecodeError は合成音声decodeの失敗分類と診断可能な原因を保持する。
//
// ErrorKindはcallerの破棄・観測判断に使い、Causeには音声payloadを含めない。
type DecodeError struct {
	// Kind はcallerがpayload破棄と観測を決める安定分類である。
	Kind ErrorKind
	// Reason はinvalid入力の有限な診断分類であり、未分類の失敗は空文字列である。
	Reason string
	// Cause はcontext cancellationやprocess/validation診断を保持し、payload byteは含めない。
	Cause error
}

// Error はpayloadを含めず、分類と原因だけを診断文字列へ変換する。
func (e *DecodeError) Error() string {
	if e == nil {
		return "<nil>"
	}
	if e.Cause == nil {
		return "synthesized audio decode failed: " + string(e.Kind)
	}
	return fmt.Sprintf("synthesized audio decode failed (%s): %v", e.Kind, e.Cause)
}

// Unwrap は原因errorをerrors.Is/errors.Asへ公開する。
func (e *DecodeError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// TimedMora は発話開始を0とする48 kHz sample区間とproducerの表示値を保持する。
//
// StartSampleはinclusive、EndSampleはexclusiveであり、Vowel/Textはnilとempty stringを区別する。
type TimedMora struct {
	// Vowelはproducer値を保持し、nilとempty stringを区別する。
	Vowel *string
	// Textはproducer値を保持し、nilとempty stringを区別する。
	Text *string
	// StartSampleは発話開始基準のinclusiveな48 kHz sample位置である。
	StartSample uint64
	// EndSampleは発話開始基準のexclusiveな48 kHz sample位置である。
	EndSample uint64
}

// DecodedSpeech は完全に検証された48 kHz mono PCMとmora timingを表す。
//
// PCMの1要素は1 sampleであり、Moraがemptyでも有効である。Decoderは部分出力を返さない。
type DecodedSpeech struct {
	// SpeechIDは入力SynthesizerResultの発話識別子を保持する。
	SpeechID int64
	// PCMは48 kHz monoの符号付き16-bit sample列である。
	PCM []int16
	// MoraはPCM範囲内の再生順sample区間であり、emptyも有効である。
	Mora []TimedMora
}

// Decoder はFFmpeg process境界を使う、immutableで並行利用可能な合成音声decoderである。
//
// Decoder自身はprocessやgoroutineを保持せずCloseを持たない。各Decodeが起動したprocessは
// success、error、cancelの全経路でCommandRunner.Runのreturn前にjoinされる。
type Decoder struct {
	ffmpegPath string
	runner     CommandRunner
}
