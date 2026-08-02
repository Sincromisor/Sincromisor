package synthdecode

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
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
	assertRunningHelperStopsAndJoins(t, false)
}

func TestExecRunnerTimeoutJoinsProcess(t *testing.T) {
	assertRunningHelperStopsAndJoins(t, true)
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

func TestExecRunnerReclaimsSuccessErrorAndCancelResources(t *testing.T) {
	t.Setenv("GO_WANT_SYNTHDECODE_HELPER", "1")
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	runner := ExecRunner{}
	baselineGoroutines := runtime.NumGoroutine()
	baselineFDs := countFDs(t)
	for attempt := range 20 {
		if _, _, exitCode, err := runner.Run(
			context.Background(), executable, nil, 4_096, 4_096,
			"-test.run=TestSynthdecodeHelperProcess", "--", "success", "",
		); err != nil || exitCode != 0 {
			t.Fatalf("success attempt %d = exit %d, error %v", attempt, exitCode, err)
		}
		if _, _, exitCode, err := runner.Run(
			context.Background(), executable, nil, 4_096, 4_096,
			"-test.run=TestSynthdecodeHelperProcess", "--", "error", "",
		); err == nil || exitCode != 7 {
			t.Fatalf("error attempt %d = exit %d, error %v; want 7/error", attempt, exitCode, err)
		}
		marker := filepath.Join(t.TempDir(), "started")
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan runnerResult, 1)
		go func() {
			_, _, exitCode, err := runner.Run(
				ctx, executable, nil, 4_096, 4_096,
				"-test.run=TestSynthdecodeHelperProcess", "--", "block", marker,
			)
			done <- runnerResult{exitCode: exitCode, err: err}
		}()
		waitForHelperPID(t, marker)
		cancel()
		result := <-done
		if result.err == nil || !errors.Is(ctx.Err(), context.Canceled) {
			t.Fatalf("cancel attempt %d = exit %d, error %v", attempt, result.exitCode, result.err)
		}
	}
	if got := runtime.NumGoroutine(); got > baselineGoroutines+2 {
		t.Fatalf("goroutines = %d after success/error/cancel, baseline %d", got, baselineGoroutines)
	}
	if got := countFDs(t); got > baselineFDs+2 {
		t.Fatalf("file descriptors = %d after success/error/cancel, baseline %d", got, baselineFDs)
	}
}

func TestSynthdecodeHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_SYNTHDECODE_HELPER") != "1" {
		return
	}
	separator := -1
	for index, arg := range os.Args {
		if arg == "--" {
			separator = index
			break
		}
	}
	if separator < 0 || len(os.Args) <= separator+2 {
		os.Exit(2)
	}
	mode := os.Args[separator+1]
	marker := os.Args[separator+2]
	switch mode {
	case "success":
		return
	case "error":
		os.Exit(7)
	case "block":
		if err := os.WriteFile(marker, []byte(strconv.Itoa(os.Getpid())), 0o600); err != nil {
			os.Exit(3)
		}
		select {}
	default:
		os.Exit(4)
	}
}

type runnerResult struct {
	exitCode int
	err      error
}

func assertRunningHelperStopsAndJoins(t *testing.T, timeout bool) {
	t.Helper()
	t.Setenv("GO_WANT_SYNTHDECODE_HELPER", "1")
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(t.TempDir(), "started")
	ctx, cancel := context.WithCancel(context.Background())
	if timeout {
		ctx, cancel = context.WithTimeout(context.Background(), 100*time.Millisecond)
	}
	defer cancel()
	done := make(chan runnerResult, 1)
	go func() {
		_, _, exitCode, err := (ExecRunner{}).Run(
			ctx, executable, nil, 4_096, 4_096,
			"-test.run=TestSynthdecodeHelperProcess", "--", "block", marker,
		)
		done <- runnerResult{exitCode: exitCode, err: err}
	}()
	pid := waitForHelperPID(t, marker)
	if !timeout {
		cancel()
	}
	select {
	case result := <-done:
		if result.err == nil {
			t.Fatalf("Run() exit = %d, error = nil; want running process cancellation", result.exitCode)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() did not return after process cancellation")
	}
	if err := syscall.Kill(pid, 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("process %d still exists after Run returned: %v", pid, err)
	}
}

func waitForHelperPID(t *testing.T, marker string) int {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		payload, err := os.ReadFile(marker)
		if err == nil {
			pid, parseErr := strconv.Atoi(strings.TrimSpace(string(payload)))
			if parseErr == nil {
				return pid
			}
		}
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("read helper marker: %v", err)
		}
		select {
		case <-deadline.C:
			t.Fatal("helper process did not report startup")
		case <-ticker.C:
		}
	}
}
