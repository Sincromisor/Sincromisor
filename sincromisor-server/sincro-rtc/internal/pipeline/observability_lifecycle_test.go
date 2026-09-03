package pipeline

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

func TestReconnectShutdownRaceRecordsFailureTerminal(t *testing.T) {
	coordinator := newTestCoordinator(t, &fakeFactory{t: t})
	observer := &recordingPipelineObserver{reconnects: make(chan string, 4)}
	if err := coordinator.ConfigureRuntime(observer, func(string) {}); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.Start(context.Background(), "session-reconnect-shutdown", "chat"); err != nil {
		t.Fatal(err)
	}
	coordinator.outputMu.Lock()
	resetDone := make(chan struct{})
	go func() {
		coordinator.requestReset(1, pclient.ServiceProcessor, resetCauseRuntimeError)
		close(resetDone)
	}()
	if result := <-observer.reconnects; result != "start" {
		t.Fatalf("first reconnect result = %q, want start", result)
	}
	closeDone := make(chan error, 1)
	go func() { closeDone <- coordinator.Close() }()
	for {
		coordinator.mu.Lock()
		closed := coordinator.state == StateClosed
		coordinator.mu.Unlock()
		if closed {
			break
		}
		time.Sleep(time.Millisecond)
	}
	coordinator.outputMu.Unlock()
	<-resetDone
	if result := <-observer.reconnects; result != "failure" {
		t.Fatalf("terminal reconnect result = %q, want failure", result)
	}
	if err := <-closeDone; err != nil {
		t.Fatal(err)
	}
	select {
	case extra := <-observer.reconnects:
		t.Fatalf("unexpected reconnect result %q", extra)
	default:
	}
}

func TestPipelineTransitionLogUsesFiniteOperationalFields(t *testing.T) {
	var logs bytes.Buffer
	coordinator, err := newCoordinatorWithHooks(
		&fakeFactory{t: t},
		slog.New(slog.NewJSONHandler(&logs, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		nonExpiringOutputWait,
	)
	if err != nil {
		t.Fatal(err)
	}
	coordinator.mu.Lock()
	err = coordinator.transitionLocked(StateRunning)
	coordinator.mu.Unlock()
	if err == nil {
		t.Fatal("invalid transition succeeded")
	}
	for _, forbidden := range []string{`"from"`, `"to"`, "payload-chat-marker"} {
		if strings.Contains(logs.String(), forbidden) {
			t.Fatalf("pipeline transition log exposed %q: %s", forbidden, logs.String())
		}
	}
	if !strings.Contains(logs.String(), `"stage":"pipeline_state"`) ||
		!strings.Contains(logs.String(), `"reason":"invalid_transition"`) {
		t.Fatalf("normalized transition log missing: %s", logs.String())
	}
}
