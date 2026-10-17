package client

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"syscall"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/diagnostics"
)

// DiagnosticAttrs は終端の操作と型を記録し、相手が指定した終了理由は既知値だけに限定する。
// 終了コード1000も接続の終了を表すだけで、進行中の音声要求の完了を意味しない。
func (e Event) DiagnosticAttrs() []any {
	attrs := []any{"operation", e.Operation}
	attrs = append(attrs, FailureAttrs(e.Err)...)
	var closeErr websocket.CloseError
	if errors.As(e.Err, &closeErr) {
		// ライブラリが作る「コードなし」の1005等を受信したコードとして記録しない。
		if closeErr.Code != websocket.StatusNoStatusRcvd && closeErr.Code != websocket.StatusAbnormalClosure && closeErr.Code != websocket.StatusTLSHandshake {
			attrs = append(attrs, "close_code", int(closeErr.Code))
		}
		reason := "unknown"
		if closeErr.Reason == "keepalive ping timeout" {
			reason = "keepalive_ping_timeout"
		}
		attrs = append(attrs, "close_reason", reason)
	}
	return attrs
}

// FailureAttrs は例外値を評価せず、既知の型・標準エラーだけから有限の原因を作る。
// URLや相手の本文を含むラップ済みエラーを直接ログへ渡してはならない。
func FailureAttrs(err error) []any {
	reason := "failed"
	var panicErr *diagnostics.Panic
	var networkError net.Error
	var closeErr websocket.CloseError
	switch {
	case errors.As(err, &panicErr):
		reason = "panic"
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &networkError) && networkError.Timeout():
		reason = "timeout"
	case errors.Is(err, context.Canceled):
		reason = "cancelled"
	case errors.As(err, &closeErr):
		reason = "remote_close"
	case errors.Is(err, syscall.ECONNREFUSED):
		reason = "connection_refused"
	case errors.Is(err, syscall.ECONNRESET):
		reason = "connection_reset"
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		reason = "eof"
	case errors.Is(err, net.ErrClosed), errors.Is(err, ErrClosed):
		reason = "closed"
	}
	attrs := []any{"reason", reason}
	if panicErr != nil {
		attrs = append(attrs, "panic_frames", panicErr.Frames)
	}
	if err != nil {
		for errors.Unwrap(err) != nil {
			err = errors.Unwrap(err)
		}
		attrs = append(attrs, "exception_type", fmt.Sprintf("%T", err))
	}
	return attrs
}
