package observability

import (
	"time"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
)

// SessionCreated は受理したSessionを記録し、SessionClosedが一度だけ解放すべき
// active gaugeの所有権を1件取得する。
func (r *Registry) SessionCreated() { r.sessionsCreated.Inc(); r.sessionsActive.Inc() }

// SessionClosed は稼働Sessionの所有権を解放し、終了結果を記録する。
// 2つのlabelはcollector参照前に固定語彙へ正規化する。
func (r *Registry) SessionClosed(outcome, reason string) {
	r.sessionsActive.Dec()
	r.sessionsClosed.WithLabelValues(
		normalize(outcome, sessionOutcomes, "failed"),
		normalize(reason, closeReasons, "unknown"),
	).Inc()
}

// SignalingRequest は有限なendpoint・status classの組を加算し、実時間を秒単位で観測する。
func (r *Registry) SignalingRequest(endpoint, statusClass string, duration time.Duration) {
	endpoint = normalize(endpoint, endpoints, "statuses")
	r.signalingCount.WithLabelValues(endpoint, normalize(statusClass, statusClasses, "5xx")).Inc()
	r.signalingLatency.WithLabelValues(endpoint).Observe(duration.Seconds())
}

// ICETransition は両方の値をPionの有限な公開状態語彙へ正規化して遷移を記録する。
func (r *Registry) ICETransition(from, to string) {
	r.iceTransitions.WithLabelValues(normalize(from, iceStates, "Unknown"), normalize(to, iceStates, "Unknown")).Inc()
}

// Deadline は有限なtimerが期限切れになった生存期間段階を加算する。
func (r *Registry) Deadline(stage string) {
	r.deadlines.WithLabelValues(normalize(stage, deadlineStages, "close")).Inc()
}

// AudioFrame は音声bytes、Session識別子、その他payload由来labelを受け取らず、
// 入出力frameの結果を記録する。
func (r *Registry) AudioFrame(direction, outcome string) {
	r.audioFrames.WithLabelValues(normalize(direction, directions, "in"), normalize(outcome, audioOutcomes, "dropped")).Inc()
}

// RTPDrop は有限な並べ替え判断を記録する。
func (r *Registry) RTPDrop(reason string) {
	r.rtpDrops.WithLabelValues(normalize(reason, rtpReasons, "reorder_flush")).Inc()
}

// RTCPFeedback はSSRCによるlabel種類数を増やさずpacket分類を記録する。
func (r *Registry) RTCPFeedback(kind string) {
	r.rtcpFeedback.WithLabelValues(normalize(kind, rtcpTypes, "other")).Inc()
}

// RTCPQuality はReceiver Reportの損失率と導出したRTT秒数を観測する。
// 負のRTTはreportに必要な時刻情報がなかったことを表す。
func (r *Registry) RTCPQuality(loss, rtt float64) {
	r.rtcpLoss.Observe(loss)
	if rtt >= 0 {
		r.rtcpRTT.Observe(rtt)
	}
}

// PacingLag は送信schedulerの遅延を秒単位で観測する。
func (r *Registry) PacingLag(seconds float64) { r.pacingLag.Observe(seconds) }

// PacingAbort は待機中の送信を破棄した理由を記録する。
func (r *Registry) PacingAbort(reason string) {
	r.pacingAborts.WithLabelValues(normalize(reason, pacingReasons, "codec")).Inc()
}

// CodecError は固定された入力decode、合成音声decode、送信encode境界の失敗を記録する。
func (r *Registry) CodecError(direction string) {
	r.codecErrors.WithLabelValues(normalize(direction, codecDirections, "encode_out")).Inc()
}

// PipelineReconnect は本番clientのservice名を公開metricの固定label語彙へ変換し、
// 1回の再接続lifecycle結果を記録する。
//
// 未知値は従来どおりextractorへ縮退し、payload由来のlabel種類数を増やさない。
func (r *Registry) PipelineReconnect(service, result string) {
	r.reconnects.WithLabelValues(normalizePipelineService(service), normalize(result, reconnectResults, "failure")).Inc()
}

// QueueDepthDelta は固定queueに対するdelta件の所有権移動を記録する。
// producerは受理したenqueue、dequeue、purge、closeの増減を釣り合わせる。
func (r *Registry) QueueDepthDelta(queue string, delta float64) {
	r.queueDepth.WithLabelValues(normalize(queue, queues, "input")).Add(delta)
}

// QueueOverflow は満杯時に選んだ固定の破棄・拒否方針を記録する。
func (r *Registry) QueueOverflow(queue, action string) {
	r.queueOverflows.WithLabelValues(normalize(queue, queues, "input"), normalize(action, overflowActions, "reject_close")).Inc()
}

// DataChannelError はpayloadを含めずtextまたはtelopの送信失敗を記録する。
func (r *Registry) DataChannelError(channel string) {
	r.dataChannelError.WithLabelValues(normalize(channel, channels, "text")).Inc()
}

// CloseDuration は資源のjoin時間と期限内完了の成否を観測する。
func (r *Registry) CloseDuration(outcome string, duration time.Duration) {
	r.closeDuration.WithLabelValues(normalize(outcome, closeOutcomes, "timeout")).Observe(duration.Seconds())
}

// ObserveInputEvent は入力の並べ替え・破棄イベントを、パケットやPCMを受け取らず固定のRTP・音声指標へ変換する。
func (r *Registry) ObserveInputEvent(event inputmedia.InputEvent) {
	switch event {
	case inputmedia.InputEventDuplicate:
		r.RTPDrop("duplicate")
		r.AudioFrame("in", "dropped")
	case inputmedia.InputEventLate:
		r.RTPDrop("late")
		r.AudioFrame("in", "dropped")
	case inputmedia.InputEventMissing:
		r.RTPDrop("missing")
		r.AudioFrame("in", "dropped")
	case inputmedia.InputEventBufferedDrop:
		r.RTPDrop("reorder_flush")
		r.AudioFrame("in", "dropped")
	case inputmedia.InputEventDTX, inputmedia.InputEventPipelineUnavailable:
		r.AudioFrame("in", "dropped")
	default:
		r.AudioFrame("in", "dropped")
	}
}
