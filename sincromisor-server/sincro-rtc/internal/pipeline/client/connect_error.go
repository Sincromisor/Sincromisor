package client

// ConnectError は接続構築の失敗段階と相手を上位へ渡す。原因の本文はErrorにもログにも出さない。
// Terminalがある場合は後続接続の取消より先に起きた公開前の終了イベントを表す。
type ConnectError struct {
	Peer      Service
	Operation string
	Err       error
	Terminal  *Event
}

// Error は要求URLや相手の応答を含めず、構築失敗だけを表す。
func (e *ConnectError) Error() string { return "pipeline connection failed" }

// Unwrap は取消・時間切れの既存判定を維持する。
func (e *ConnectError) Unwrap() error { return e.Err }

// DiagnosticAttrs は構築段階と、存在すれば最初の公開前イベントの安全な診断を返す。
func (e *ConnectError) DiagnosticAttrs() []any {
	attrs := []any{"peer", string(e.Peer), "connect_stage", e.Operation}
	if e.Terminal != nil {
		return append(attrs, e.Terminal.DiagnosticAttrs()...)
	}
	return append(attrs, FailureAttrs(e.Err)...)
}
