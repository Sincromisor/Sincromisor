package pipeline

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"reflect"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestCoordinatorLifecycleQueueAndBackoff(t *testing.T) {
	t.Run("close during start", func(t *testing.T) {
		factory := &blockingFactory{entered: make(chan struct{})}
		coordinator := newTestCoordinator(t, factory)
		result := make(chan error, 1)
		go func() { result <- coordinator.Start(context.Background(), "session-close", "sincro") }()
		<-factory.entered
		if err := coordinator.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if err := <-result; !errors.Is(err, ErrClosed) {
			t.Fatalf("Start() error = %v, want ErrClosed", err)
		}
	})

	t.Run("drop oldest and fixed retry caps", func(t *testing.T) {
		queue := newFrameQueue()
		for value := byte(0); value < inputQueueCapacity+1; value++ {
			queue.push([]byte{value})
		}
		frame, ok := queue.pop(context.Background())
		if !ok || frame[0] != 1 {
			t.Fatalf("oldest retained frame = %v/%t, want [1]/true", frame, ok)
		}
		var caps []time.Duration
		coordinator, err := newCoordinatorWithHooks(
			&fakeFactory{t: t}, slog.New(slog.NewTextHandler(io.Discard, nil)),
			func(cap time.Duration) (time.Duration, error) {
				caps = append(caps, cap)
				return 0, nil
			},
			immediateWait,
		)
		if err != nil {
			t.Fatalf("newCoordinatorWithHooks() error = %v", err)
		}
		for attempt := uint(0); attempt <= 7; attempt++ {
			if _, err := coordinator.retryDelay(attempt); err != nil {
				t.Fatalf("retryDelay(%d) error = %v", attempt, err)
			}
		}
		want := []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 30 * time.Second, 30 * time.Second, 30 * time.Second}
		if !reflect.DeepEqual(caps, want) {
			t.Fatalf("retry caps = %v, want %v", caps, want)
		}
	})
}

func TestCoordinatorCountsPCMDropsAcrossQueueReplacement(t *testing.T) {
	coordinator := newTestCoordinator(t, &fakeFactory{t: t})
	coordinator.mu.Lock()
	coordinator.state = StateRunning
	coordinator.work = &generationWork{input: newFrameQueue()}
	coordinator.mu.Unlock()

	fill := func() {
		for range inputQueueCapacity + 1 {
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("SubmitPCM() error = %v", err)
			}
		}
	}
	fill()
	coordinator.mu.Lock()
	coordinator.work.input = newFrameQueue()
	coordinator.mu.Unlock()
	fill()
	coordinator.mu.Lock()
	drops := coordinator.pcmDrops
	coordinator.mu.Unlock()
	if drops != 2 {
		t.Fatalf("session PCM drop count = %d, want 2", drops)
	}
}

func TestOutputBackpressureUsesGenerationBarrierAndCloseOwnership(t *testing.T) {
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
	if err := coordinator.Start(context.Background(), "session-output", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	message := protocol.ChatMessage{SpeechID: 1, MessageID: "output", MessageType: "assistant"}
	if err := coordinator.publishText(1, pclient.ServiceProcessor, message); err != nil {
		t.Fatalf("publish handed output error = %v", err)
	}
	handed := receive(t, coordinator.TextResults())
	for range outputQueueCapacity {
		if err := coordinator.publishText(1, pclient.ServiceProcessor, message); err != nil {
			t.Fatalf("fill output error = %v", err)
		}
	}
	waiter.discardOutputRequests(t, outputQueueCapacity+1)

	publishDone := make(chan error, 1)
	go func() {
		err := coordinator.publishText(1, pclient.ServiceProcessor, message)
		if err != nil {
			coordinator.requestReset(1, pclient.ServiceProcessor, resetCauseRuntimeError)
		}
		publishDone <- err
	}()
	waiter.expireNextOutput(t)
	if err := receive(t, publishDone); err == nil {
		t.Fatal("full output channel did not time out")
	}
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == 2
	})
	if len(coordinator.textOut) != 0 {
		t.Fatalf("reset left %d old buffered text outputs", len(coordinator.textOut))
	}
	if handed.Generation != 1 {
		t.Fatalf("already handed output generation = %d, want 1", handed.Generation)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	assertClosedOutputs(t, coordinator)
}
