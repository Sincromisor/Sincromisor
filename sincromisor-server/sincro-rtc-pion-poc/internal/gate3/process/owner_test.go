package process

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

func TestOwnerRejectsStartAndSignalStateErrors(t *testing.T) {
	owner := New(Command{Path: "relative", Dir: t.TempDir()})
	if err := owner.Signal(syscall.SIGTERM); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("Signal before Start error = %v", err)
	}
	if _, err := owner.Wait(context.Background()); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("Wait before Start error = %v", err)
	}
	if err := owner.Start(); err == nil {
		t.Fatal("Start with relative path succeeded")
	}
	if err := owner.Start(); !errors.Is(err, ErrAlreadyStarted) {
		t.Fatalf("second Start error = %v", err)
	}
}

func TestOwnerRecordsExecutableStartFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "invalid-executable")
	if err := os.WriteFile(path, []byte("not an executable format"), 0o700); err != nil {
		t.Fatal(err)
	}
	owner := New(Command{Path: path, Dir: t.TempDir(), Env: []string{}})
	if err := owner.Start(); err == nil || !strings.Contains(err.Error(), "start process") {
		t.Fatalf("Start() error = %v", err)
	}
	if err := owner.Start(); !errors.Is(err, ErrAlreadyStarted) {
		t.Fatalf("second Start error = %v", err)
	}
}

func TestOwnerNormalExitAndStableWaitResult(t *testing.T) {
	owner := newHelperOwner(t, "normal")
	if err := owner.Start(); err != nil {
		t.Fatal(err)
	}
	first, err := owner.Wait(context.Background())
	if err != nil {
		t.Fatalf("Wait() error = %v", err)
	}
	second, err := owner.Wait(context.Background())
	if err != nil {
		t.Fatalf("second Wait() error = %v", err)
	}
	if first.PID <= 0 || first.ExitCode != 0 || string(first.Stdout.Data) != "stdout\n" ||
		string(first.Stderr.Data) != "stderr\n" || resultsDiffer(first, second) {
		t.Fatalf("results differ or invalid: first=%+v second=%+v", first, second)
	}
	if err := owner.Signal(syscall.SIGTERM); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("Signal after exit error = %v", err)
	}
}

func TestOwnerPIDIsAvailableOnlyWhileRunning(t *testing.T) {
	owner := newHelperOwner(t, "wait")
	if _, err := owner.PID(); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("PID before Start error = %v", err)
	}
	if err := owner.Start(); err != nil {
		t.Fatal(err)
	}
	if pid, err := owner.PID(); err != nil || pid <= 0 {
		t.Fatalf("running PID = (%d, %v)", pid, err)
	}
	if _, err := owner.Close(); err == nil {
		t.Fatal("Close() error = nil, want signal exit error")
	}
	if _, err := owner.PID(); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("PID after Close error = %v", err)
	}
}

func TestWaitTimeoutDoesNotStopProcessAndCloseJoins(t *testing.T) {
	owner := newHelperOwner(t, "wait")
	if err := owner.Start(); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := owner.Wait(ctx); !errors.Is(err, ErrWaitTimeout) || owner.State() != StateRunning {
		t.Fatalf("timed Wait = (%v, %s), want ErrWaitTimeout/running", err, owner.State())
	}
	result, err := owner.Close()
	if err == nil {
		t.Fatalf("Close() error = nil, want signal exit error; result=%+v", result)
	}
	if owner.State() != StateExited {
		t.Fatalf("state after Close = %s", owner.State())
	}
	again, waitErr := owner.Wait(context.Background())
	if again.PID != result.PID || fmt.Sprint(waitErr) != fmt.Sprint(err) {
		t.Fatalf("Wait after Close = (%+v, %v), Close = (%+v, %v)", again, waitErr, result, err)
	}
}

func TestSignalRunningProcessAndWaitCollectsExit(t *testing.T) {
	owner := newHelperOwner(t, "wait")
	if err := owner.Start(); err != nil {
		t.Fatal(err)
	}
	if err := owner.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("Signal running process error = %v", err)
	}
	result, err := owner.Wait(context.Background())
	if err == nil || result.ExitCode == 0 || owner.State() != StateExited {
		t.Fatalf("Wait after signal = (%+v, %v), state=%s", result, err, owner.State())
	}
}

func TestCloseKillsProcessIgnoringSIGTERM(t *testing.T) {
	owner, ready := newReadyHelperOwner(t, "ignore-term", 30*time.Millisecond)
	if err := owner.Start(); err != nil {
		t.Fatal(err)
	}
	waitForHelperReady(t, ready)
	result, err := owner.Close()
	if err == nil || result.ExitCode == 0 || owner.State() != StateExited {
		t.Fatalf("Close() = (%+v, %v), state=%s", result, err, owner.State())
	}
}

func TestTailBufferExactBoundaryDoesNotTruncate(t *testing.T) {
	buffer := newTailBuffer(outputLimit)
	if _, err := buffer.Write(bytes.Repeat([]byte("x"), outputLimit)); err != nil {
		t.Fatal(err)
	}
	output := buffer.output()
	if len(output.Data) != outputLimit || output.Truncated {
		t.Fatalf("exact boundary output = %d/%v", len(output.Data), output.Truncated)
	}
}

func TestConcurrentWaitAndCloseDoNotDeadlock(t *testing.T) {
	owner := newHelperOwnerWithGrace(t, "wait", 30*time.Millisecond)
	if err := owner.Start(); err != nil {
		t.Fatal(err)
	}
	var waitResult, closeResult Result
	var waitErr, closeErr error
	var group sync.WaitGroup
	group.Add(2)
	go func() {
		defer group.Done()
		waitResult, waitErr = owner.Wait(context.Background())
	}()
	go func() {
		defer group.Done()
		closeResult, closeErr = owner.Close()
	}()
	done := make(chan struct{})
	go func() {
		group.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Wait/Close deadlocked")
	}
	if waitResult.PID != closeResult.PID || fmt.Sprint(waitErr) != fmt.Sprint(closeErr) {
		t.Fatalf("Wait=(%+v,%v), Close=(%+v,%v)", waitResult, waitErr, closeResult, closeErr)
	}
}

func TestOutputKeepsBoundedTail(t *testing.T) {
	owner := newHelperOwner(t, "large-output")
	if err := owner.Start(); err != nil {
		t.Fatal(err)
	}
	result, err := owner.Wait(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Stdout.Data) != outputLimit || len(result.Stderr.Data) != outputLimit ||
		!result.Stdout.Truncated || !result.Stderr.Truncated {
		t.Fatalf("bounded output sizes/flags = %d/%v %d/%v",
			len(result.Stdout.Data), result.Stdout.Truncated, len(result.Stderr.Data), result.Stderr.Truncated)
	}
	if !bytes.Equal(result.Stdout.Data, bytes.Repeat([]byte("b"), outputLimit)) ||
		!bytes.Equal(result.Stderr.Data, bytes.Repeat([]byte("d"), outputLimit)) {
		t.Fatal("bounded output did not keep the tail")
	}
}

func TestCloseBeforeStartPreventsLaterStart(t *testing.T) {
	owner := newHelperOwner(t, "normal")
	if _, err := owner.Close(); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("Close before Start error = %v", err)
	}
	if err := owner.Start(); !errors.Is(err, ErrAlreadyStarted) {
		t.Fatalf("Start after Close error = %v", err)
	}
}

func TestOwnerHelperProcess(t *testing.T) {
	mode := os.Getenv("GATE3_PROCESS_HELPER")
	if mode == "" {
		return
	}
	switch mode {
	case "normal":
		_, _ = os.Stdout.WriteString("stdout\n")
		_, _ = os.Stderr.WriteString("stderr\n")
	case "wait":
		for {
			time.Sleep(time.Hour)
		}
	case "ignore-term":
		signal.Ignore(syscall.SIGTERM)
		if err := os.WriteFile(os.Getenv("GATE3_PROCESS_READY"), []byte("ready"), 0o600); err != nil {
			os.Exit(3)
		}
		for {
			time.Sleep(time.Hour)
		}
	case "large-output":
		_, _ = os.Stdout.WriteString(strings.Repeat("a", 19) + strings.Repeat("b", outputLimit))
		_, _ = os.Stderr.WriteString(strings.Repeat("c", 23) + strings.Repeat("d", outputLimit))
	default:
		os.Exit(2)
	}
	os.Exit(0)
}

func newHelperOwner(t *testing.T, mode string) *Owner {
	t.Helper()
	return newHelperOwnerWithGrace(t, mode, time.Second)
}

func newHelperOwnerWithGrace(t *testing.T, mode string, grace time.Duration) *Owner {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		t.Fatal(err)
	}
	command := Command{
		Path: executable,
		Args: []string{"-test.run=^TestOwnerHelperProcess$"},
		Env:  []string{"GATE3_PROCESS_HELPER=" + mode},
		Dir:  t.TempDir(),
	}
	return newWithGrace(command, grace)
}

func newReadyHelperOwner(t *testing.T, mode string, grace time.Duration) (*Owner, string) {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		t.Fatal(err)
	}
	ready := filepath.Join(t.TempDir(), "ready")
	command := Command{
		Path: executable,
		Args: []string{"-test.run=^TestOwnerHelperProcess$"},
		Env: []string{
			"GATE3_PROCESS_HELPER=" + mode,
			"GATE3_PROCESS_READY=" + ready,
		},
		Dir: t.TempDir(),
	}
	return newWithGrace(command, grace), ready
}

func waitForHelperReady(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("helper did not become ready")
}

func resultsDiffer(first, second Result) bool {
	return first.PID != second.PID ||
		first.ExitCode != second.ExitCode ||
		!first.StartedAt.Equal(second.StartedAt) ||
		!first.ExitedAt.Equal(second.ExitedAt) ||
		!bytes.Equal(first.Stdout.Data, second.Stdout.Data) ||
		!bytes.Equal(first.Stderr.Data, second.Stderr.Data) ||
		first.Stdout.Truncated != second.Stdout.Truncated ||
		first.Stderr.Truncated != second.Stderr.Truncated
}
