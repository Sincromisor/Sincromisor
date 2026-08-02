package synthdecode

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"runtime"
	"testing"
	"time"
)

func TestExecRunnerLimitsOutputAndReturnsExitCode(t *testing.T) {
	runner := ExecRunner{}
	stdout, stderr, exitCode, err := runner.Run(
		context.Background(), "/bin/sh", nil, 3, 2, "-c", "printf 12345; printf abcd >&2; exit 7",
	)
	if err == nil {
		t.Fatal("Run() error = nil, want exit error")
	}
	if string(stdout) != "1234" || string(stderr) != "abc" || exitCode != 7 {
		t.Fatalf("Run() = stdout %q stderr %q exit %d, want 1234/abc/7",
			stdout, stderr, exitCode)
	}
}

func TestExecRunnerCancellationJoinsProcess(t *testing.T) {
	runner := ExecRunner{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, _, err := runner.Run(ctx, "/bin/sh", nil, 10, 10, "-c", "read value")
	if err == nil || !errors.Is(ctx.Err(), context.Canceled) {
		t.Fatalf("Run() error = %v, want canceled process", err)
	}
}

func TestExecRunnerMalformedDecodeDoesNotLeakResources(t *testing.T) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("system ffmpeg is unavailable")
	}
	decoder, err := NewDecoder(ffmpegPath, ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	input := validResult("audio/wav")
	input.Voice = []byte("not a wav")
	baselineGoroutines := runtime.NumGoroutine()
	baselineFDs := countFDs(t)
	for range 100 {
		if _, err := decoder.Decode(context.Background(), input); err == nil {
			t.Fatal("Decode() error = nil, want malformed input rejection")
		}
	}
	deadline := time.Now().Add(time.Second)
	for runtime.NumGoroutine() > baselineGoroutines+2 && time.Now().Before(deadline) {
		runtime.Gosched()
	}
	if got := runtime.NumGoroutine(); got > baselineGoroutines+2 {
		t.Fatalf("goroutines = %d after malformed decodes, baseline %d", got, baselineGoroutines)
	}
	if got := countFDs(t); got > baselineFDs+2 {
		t.Fatalf("file descriptors = %d after malformed decodes, baseline %d", got, baselineFDs)
	}
}

func countFDs(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		t.Skipf("fd inventory unavailable: %v", err)
	}
	return len(entries)
}
