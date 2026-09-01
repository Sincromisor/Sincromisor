package pipeline

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"runtime"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestCoordinatorRepeatedCloseDoesNotLeakGenerationWorkers(t *testing.T) {
	baseline := runtime.NumGoroutine()
	for attempt := 0; attempt < 10; attempt++ {
		factory := &fakeFactory{t: t}
		coordinator := newTestCoordinator(t, factory)
		if err := coordinator.Start(context.Background(), "session-leak", "sincro"); err != nil {
			t.Fatalf("attempt %d Start() error = %v", attempt, err)
		}
		if err := coordinator.Close(); err != nil {
			t.Fatalf("attempt %d first Close() error = %v", attempt, err)
		}
		if err := coordinator.Close(); err != nil {
			t.Fatalf("attempt %d second Close() error = %v", attempt, err)
		}
		if factory.setAt(t, 0).closeCount() != 1 {
			t.Fatalf("attempt %d client set was not close-once", attempt)
		}
	}
	waitFor(t, func() bool { return runtime.NumGoroutine() <= baseline+5 })
}

func TestClientEventPublicationWindows(t *testing.T) {
	for _, window := range []eventWindow{
		windowBeforeConnectReturn,
		windowReturnBeforeActivate,
		windowActivateBeforeRunning,
	} {
		t.Run(string(window), func(t *testing.T) {
			factory := &windowFactory{t: t, window: window}
			coordinator := newTestCoordinator(t, factory)
			if err := coordinator.Start(context.Background(), "session-window", "sincro"); err != nil {
				t.Fatalf("Start() error = %v", err)
			}
			wantGeneration := uint64(1)
			if window == windowActivateBeforeRunning {
				wantGeneration = 2
				waitForGeneration(t, coordinator, wantGeneration)
			}
			coordinator.mu.Lock()
			generation := coordinator.generation
			coordinator.mu.Unlock()
			if generation != wantGeneration {
				t.Fatalf("generation = %d, want %d", generation, wantGeneration)
			}
			if factory.count() != 2 {
				t.Fatalf("client set attempts = %d, want 2", factory.count())
			}
			if factory.firstCloseCount() != 1 {
				t.Fatalf("failed/published first set Close count = %d, want 1", factory.firstCloseCount())
			}
			if err := coordinator.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
}

func TestCloseConvergesDuringResetAndBackpressure(t *testing.T) {
	t.Run("reset reconnect", func(t *testing.T) {
		factory := &closeRaceFactory{t: t, reconnectEntered: make(chan struct{})}
		coordinator := newTestCoordinator(t, factory)
		if err := coordinator.Start(context.Background(), "session-reset-close", "sincro"); err != nil {
			t.Fatalf("Start() error = %v", err)
		}
		factory.first().emit(pclient.Event{
			Service: pclient.ServiceExtractor,
			Kind:    pclient.EventRemoteClose,
			Err:     errors.New("reset"),
		})
		select {
		case <-factory.reconnectEntered:
		case <-time.After(time.Second):
			t.Fatal("reset did not enter reconnect")
		}
		closeDone := make(chan error, 2)
		go func() { closeDone <- coordinator.Close() }()
		go func() { closeDone <- coordinator.Close() }()
		for range 2 {
			if err := receive(t, closeDone); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		}
		if factory.first().closeCount() != 1 {
			t.Fatalf("old set Close count = %d, want 1", factory.first().closeCount())
		}
		assertClosedOutputs(t, coordinator)
	})

	t.Run("output timeout", func(t *testing.T) {
		factory := &fakeFactory{t: t}
		waiter := newControlledWaiter()
		coordinator, err := newCoordinatorWithHooks(
			factory,
			slog.New(slog.NewTextHandler(io.Discard, nil)),
			func(time.Duration) (time.Duration, error) { return 0, nil },
			waiter.wait,
		)
		if err != nil {
			t.Fatalf("newCoordinatorWithHooks() error = %v", err)
		}
		if err := coordinator.Start(context.Background(), "session-timeout-close", "sincro"); err != nil {
			t.Fatalf("Start() error = %v", err)
		}
		message := protocol.ChatMessage{SpeechID: 1, MessageID: "full"}
		for range outputQueueCapacity {
			if err := coordinator.publishText(1, pclient.ServiceProcessor, message); err != nil {
				t.Fatalf("fill output error = %v", err)
			}
		}
		waiter.discardOutputRequests(t, outputQueueCapacity)
		publishDone := make(chan error, 1)
		go func() {
			err := coordinator.publishText(1, pclient.ServiceProcessor, message)
			if err != nil {
				coordinator.requestReset(1, pclient.ServiceProcessor, resetCauseRuntimeError)
			}
			publishDone <- err
		}()
		waiter.expireNextOutput(t)
		closeDone := make(chan error, 1)
		go func() { closeDone <- coordinator.Close() }()
		if err := receive(t, publishDone); err == nil {
			t.Fatal("backpressure publish succeeded")
		}
		if err := receive(t, closeDone); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		assertClosedOutputs(t, coordinator)
	})
}
