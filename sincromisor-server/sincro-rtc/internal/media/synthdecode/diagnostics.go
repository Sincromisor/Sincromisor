package synthdecode

import (
	"context"
	"errors"
	"strings"
	"time"
)

// processFailureは実行済みコマンドの安全な診断だけを保持し、既存の原因判定をUnwrapで保つ。
// 任意のstderrやコマンド引数は保持しない。入力に同じ語が含まれても固定分類しか外へ出ない。
type processFailure struct {
	cause      error
	stage      string
	exitCode   int
	outcome    string
	diagnostic string
	truncated  bool
	duration   time.Duration
}

func (e *processFailure) Error() string { return e.cause.Error() }
func (e *processFailure) Unwrap() error { return e.cause }

// processDiagnosticは既存の有限stderrから既知の診断だけを抜き出す。未知部分は全て除去する。
func processDiagnostic(stage string, ctx context.Context, stderr []byte, limit int, exitCode int, started time.Time) *processFailure {
	truncated := len(stderr) > limit
	if truncated {
		stderr = stderr[:limit]
	}
	text := strings.ToLower(string(stderr))
	diagnostic := []string{}
	for _, fragment := range []string{"invalid data found", "error opening input", "invalid argument", "permission denied", "no such file or directory", "decoder not found", "unknown decoder", "out of memory", "error while decoding", "conversion failed"} {
		if strings.Contains(text, fragment) {
			diagnostic = append(diagnostic, fragment)
		}
	}
	safe := strings.Join(diagnostic, "; ")
	if safe == "" {
		if len(stderr) > 0 {
			safe = "output_redacted"
		} else {
			safe = "empty"
		}
	}
	outcome := "failed"
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		outcome = "timeout"
	} else if errors.Is(ctx.Err(), context.Canceled) {
		outcome = "cancelled"
	} else if exitCode < 0 {
		outcome = "start_or_signal_failure"
	}
	return &processFailure{stage: stage, exitCode: exitCode, outcome: outcome, diagnostic: safe, truncated: truncated, duration: time.Since(started)}
}

// DiagnosticAttrsは実行境界で生成した限定項目だけをログへ渡す。任意errorの自由文は参照しない。
// 実行前の入力検証や、診断を持たないテスト用デコーダーでは空を返す。
func DiagnosticAttrs(err error) []any {
	var failure *processFailure
	if !errors.As(err, &failure) {
		return nil
	}
	return []any{"event", "audio_command_failure", "command", "ffmpeg", "stage", failure.stage, "exit_code", failure.exitCode, "outcome", failure.outcome, "stderr_diagnostic", failure.diagnostic, "stderr_truncated", failure.truncated, "duration_ms", failure.duration.Milliseconds()}
}
