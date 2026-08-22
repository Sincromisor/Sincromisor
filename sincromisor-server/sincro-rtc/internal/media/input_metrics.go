package media

import (
	"sync/atomic"
)

// InputEvent は音声payloadを含めず、入力側の破棄または不連続を1件ずつ識別する。
//
// eventは破棄を決定した位置で同期通知する。Coordinator queue overflowはSubmitPCM自身が集計し、
// InputProcessorから見れば受理済みframeなので、このeventには含めない。
type InputEvent string

const (
	// InputEventDuplicate はbuffer内または送出済みwindow内と同じsequenceのpacketを表す。
	InputEventDuplicate InputEvent = "duplicate"
	// InputEventLate はmissing確定後または送出履歴のwindowより古く到着したpacketを表す。
	InputEventLate InputEvent = "late"
	// InputEventMissing はreorder windowを進めるため欠番を確定したpacket位置を表す。
	InputEventMissing InputEvent = "missing"
	// InputEventBufferedDrop はgapより後ろに残ったままstreamを終了したpacketを表す。
	InputEventBufferedDrop InputEvent = "buffered_drop"
	// InputEventDTX はdecode対象外の空Opus payloadを表す。
	InputEventDTX InputEvent = "dtx"
	// InputEventPipelineUnavailable はreset/readiness中に再送せず破棄したPCM frameを表す。
	InputEventPipelineUnavailable InputEvent = "pipeline_unavailable"
)

// InputObserver は入力event 1件につき1回のcallbackを受ける。
//
// ObserveInputEventは複数sessionからの並行呼び出しに耐える必要がある。通知failureという別経路を
// 作らないため戻り値を持たず、panicはInputProcessor.Runがmedia errorへ変換してSession.Closeへ戻す。
type InputObserver interface {
	ObserveInputEvent(InputEvent)
}

type inputTelemetry interface {
	AudioFrame(direction, outcome string)
	CodecError(direction string)
}

func observeAcceptedInput(observer InputObserver) {
	if telemetry, ok := observer.(inputTelemetry); ok {
		telemetry.AudioFrame("in", "accepted")
	}
}

func observeInputCodecError(observer InputObserver) {
	if telemetry, ok := observer.(inputTelemetry); ok {
		telemetry.CodecError("decode_in")
	}
}

// InputEventCounts はprocess共有counterのある時点のsnapshotである。
type InputEventCounts struct {
	Duplicate           uint64
	Late                uint64
	Missing             uint64
	BufferedDrop        uint64
	DTX                 uint64
	PipelineUnavailable uint64
}

// InputCounterObserver は全event種別のprocess-lifetime atomic counterを所有する。
type InputCounterObserver struct {
	duplicate           atomic.Uint64
	late                atomic.Uint64
	missing             atomic.Uint64
	bufferedDrop        atomic.Uint64
	dtx                 atomic.Uint64
	pipelineUnavailable atomic.Uint64
}

// NewInputCounterObserver は全counterが0のprocess共有observerを作る。
func NewInputCounterObserver() *InputCounterObserver {
	return &InputCounterObserver{}
}

// ObserveInputEvent は対応するcounterだけを1増加させ、未知eventではpanicする。
//
// 未知値は外部入力ではなく配線不備なので黙って集計を壊さない。InputProcessorはpanicを通常の
// error/cleanup経路へ変換する。
func (o *InputCounterObserver) ObserveInputEvent(event InputEvent) {
	switch event {
	case InputEventDuplicate:
		o.duplicate.Add(1)
	case InputEventLate:
		o.late.Add(1)
	case InputEventMissing:
		o.missing.Add(1)
	case InputEventBufferedDrop:
		o.bufferedDrop.Add(1)
	case InputEventDTX:
		o.dtx.Add(1)
	case InputEventPipelineUnavailable:
		o.pipelineUnavailable.Add(1)
	default:
		panic("unknown input event")
	}
}

// Snapshot はactive sessionを停止せず、各atomic counterを独立に読み取って返す。
func (o *InputCounterObserver) Snapshot() InputEventCounts {
	return InputEventCounts{
		Duplicate:           o.duplicate.Load(),
		Late:                o.late.Load(),
		Missing:             o.missing.Load(),
		BufferedDrop:        o.bufferedDrop.Load(),
		DTX:                 o.dtx.Load(),
		PipelineUnavailable: o.pipelineUnavailable.Load(),
	}
}
