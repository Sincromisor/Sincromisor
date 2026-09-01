// Package observability はRTC process固有のPrometheus registryと、
// label種類数を有限に保つevent語彙を所有する。
package observability

import "time"

// Recorder はsignalingとRTC生存期間が共有する型付き観測境界である。
// 呼び出し側はpayloadからmetricやlabelを生成できない。
type Recorder interface {
	// SessionCreated は稼働Sessionの所有権を1件取得する。
	SessionCreated()
	// SessionClosed は稼働Sessionの所有権を解放し、正規化した終了結果を記録する。
	SessionClosed(outcome, reason string)
	// SignalingRequest は正規化したendpoint・statusと実時間を記録する。
	SignalingRequest(endpoint, statusClass string, duration time.Duration)
	// ICETransition は有限なPion ICE状態間の遷移を記録する。
	ICETransition(from, to string)
	// Deadline は期限切れになった有限な生存期間段階を記録する。
	Deadline(stage string)
	// AudioFrame はpayloadを持たない入出力frame結果を記録する。
	AudioFrame(direction, outcome string)
	// RTPDrop は有限な並べ替え破棄理由を記録する。
	RTPDrop(reason string)
	// RTCPFeedback はSSRCやreport識別子を含めずpacket分類を記録する。
	RTCPFeedback(feedbackType string)
	// RTCPQuality はReceiver Reportの損失率と任意のRTT秒数を観測する。
	RTCPQuality(lossRatio, rttSeconds float64)
	// PacingLag は送信schedulerの正の遅延秒数を観測する。
	PacingLag(seconds float64)
	// PacingAbort は待機中の送信音声を破棄した理由を記録する。
	PacingAbort(reason string)
	// CodecError は固定されたdecodeまたはencode境界の失敗を記録する。
	CodecError(direction string)
	// PipelineReconnect は固定下流serviceの開始・成功・失敗を記録する。
	PipelineReconnect(service, result string)
	// QueueDepthDelta は固定queueへのitem所有権の出入りを記録する。
	QueueDepthDelta(queue string, delta float64)
	// QueueOverflow は満杯時に選んだ有限な破棄・拒否方針を記録する。
	QueueOverflow(queue, action string)
	// DataChannelError はtextまたはtelopの送信失敗を記録する。
	DataChannelError(channel string)
	// CloseDuration はSession資源のjoin時間と期限結果を観測する。
	CloseDuration(outcome string, duration time.Duration)
}

type nopRecorder struct{}

func (nopRecorder) SessionCreated()                                {}
func (nopRecorder) SessionClosed(string, string)                   {}
func (nopRecorder) SignalingRequest(string, string, time.Duration) {}
func (nopRecorder) ICETransition(string, string)                   {}
func (nopRecorder) Deadline(string)                                {}
func (nopRecorder) AudioFrame(string, string)                      {}
func (nopRecorder) RTPDrop(string)                                 {}
func (nopRecorder) RTCPFeedback(string)                            {}
func (nopRecorder) RTCPQuality(float64, float64)                   {}
func (nopRecorder) PacingLag(float64)                              {}
func (nopRecorder) PacingAbort(string)                             {}
func (nopRecorder) CodecError(string)                              {}
func (nopRecorder) PipelineReconnect(string, string)               {}
func (nopRecorder) QueueDepthDelta(string, float64)                {}
func (nopRecorder) QueueOverflow(string, string)                   {}
func (nopRecorder) DataChannelError(string)                        {}
func (nopRecorder) CloseDuration(string, time.Duration)            {}

// Discard は全eventを意図的に破棄する並行安全なRecorderを返す。
// 本番起動処理はRegistryを注入し、この代替実装は対象を絞ったcomponent試験と
// metrics endpointを公開しない呼び出し側だけが使う。
func Discard() Recorder { return nopRecorder{} }
