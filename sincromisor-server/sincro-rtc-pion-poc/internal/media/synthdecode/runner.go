package synthdecode

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
)

// CommandRunner は shell を介さず、有限な標準入出力で外部 command を実行する process 境界である。
//
// Run は stdin を command へ渡し、stdout と stderr をそれぞれ指定 byte 数の1 byte先まで保持する。
// この超過 byte により caller は切り詰められた正常出力を完全な出力と誤認しない。process は ctx の
// cancelで停止され、Runは必ずWait相当のjoinを終えてから返す。
type CommandRunner interface {
	Run(
		ctx context.Context,
		executable string,
		stdin []byte,
		stdoutLimit int64,
		stderrLimit int64,
		args ...string,
	) (stdout, stderr []byte, exitCode int, err error)
}

// ExecRunner は os/exec を使う production CommandRunner である。
//
// zero valueを並行利用でき、process以外のresourceを保持しない。
type ExecRunner struct{}

// Run は executable を直接起動し、終了またはctx cancelまでprocessをjoinする。
//
// executable探索、exit codeの意味、出力超過の分類はcallerへ委ねる。起動不能時のexitCodeは-1である。
func (ExecRunner) Run(
	ctx context.Context,
	executable string,
	stdin []byte,
	stdoutLimit int64,
	stderrLimit int64,
	args ...string,
) ([]byte, []byte, int, error) {
	if ctx == nil {
		return nil, nil, -1, errors.New("command context must not be nil")
	}
	if stdoutLimit < 0 || stderrLimit < 0 {
		return nil, nil, -1, errors.New("command output limits must not be negative")
	}
	command := exec.CommandContext(ctx, executable, args...)
	command.Stdin = bytes.NewReader(stdin)
	stdout := newLimitedBuffer(stdoutLimit)
	stderr := newLimitedBuffer(stderrLimit)
	command.Stdout = stdout
	command.Stderr = stderr
	err := command.Run()
	exitCode := 0
	if err != nil {
		exitCode = -1
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
		}
	}
	return stdout.Bytes(), stderr.Bytes(), exitCode, err
}

// limitedBuffer はprocess pipeを詰まらせず全byteを受理し、上限超過の判定に必要な1 byteだけ余分に保持する。
type limitedBuffer struct {
	limit int64
	data  []byte
}

func newLimitedBuffer(limit int64) *limitedBuffer {
	return &limitedBuffer{limit: limit}
}

func (b *limitedBuffer) Write(payload []byte) (int, error) {
	remaining := b.limit + 1 - int64(len(b.data))
	if remaining > 0 {
		keep := int64(len(payload))
		if keep > remaining {
			keep = remaining
		}
		b.data = append(b.data, payload[:keep]...)
	}
	return len(payload), nil
}

func (b *limitedBuffer) Bytes() []byte {
	return b.data
}
