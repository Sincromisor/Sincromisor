package pipeline

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

func newTestCoordinator(t *testing.T, factory ClientSetFactory) *Coordinator {
	t.Helper()
	coordinator, err := newCoordinatorWithHooks(
		factory, slog.New(slog.NewTextHandler(io.Discard, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		nonExpiringOutputWait,
	)
	if err != nil {
		t.Fatalf("newCoordinatorWithHooks() error = %v", err)
	}
	return coordinator
}

func immediateWait(ctx context.Context, _ time.Duration) <-chan error {
	result := make(chan error, 1)
	select {
	case <-ctx.Done():
		result <- ctx.Err()
	default:
		result <- nil
	}
	return result
}

func nonExpiringOutputWait(ctx context.Context, delay time.Duration) <-chan error {
	if delay != outputBackpressure {
		return immediateWait(ctx, delay)
	}
	result := make(chan error, 1)
	go func() {
		<-ctx.Done()
		result <- ctx.Err()
	}()
	return result
}

func receive[T any](t *testing.T, values <-chan T) T {
	t.Helper()
	select {
	case value := <-values:
		return value
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for pipeline value")
		var zero T
		return zero
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		if condition() {
			return
		}
		select {
		case <-deadline.C:
			t.Fatal("timed out waiting for condition")
		case <-ticker.C:
		}
	}
}

func assertClosedOutputs(t *testing.T, coordinator *Coordinator) {
	t.Helper()
	assertChannelEventuallyClosed(t, coordinator.TextResults(), "text")
	assertChannelEventuallyClosed(t, coordinator.SynthResults(), "synth")
}

func assertChannelEventuallyClosed[T any](t *testing.T, values <-chan T, name string) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		select {
		case _, ok := <-values:
			if !ok {
				return
			}
		case <-deadline.C:
			t.Fatalf("%s output remained open after Close", name)
		}
	}
}

type fakeFactory struct {
	t          *testing.T
	mu         sync.Mutex
	sets       []*fakeSet
	identities []testExtractionIdentity
}

type testExtractionIdentity struct {
	speechID   int64
	sequenceID int64
}

func (f *fakeFactory) Connect(_ context.Context, sessionID, _ string) (ClientSet, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	identity := testExtractionIdentity{
		speechID: int64(len(f.sets) + 1), sequenceID: int64(len(f.sets) + 1),
	}
	if len(f.sets) < len(f.identities) {
		identity = f.identities[len(f.sets)]
	}
	set := newFakeSet(f.t, sessionID, identity.speechID, identity.sequenceID)
	f.sets = append(f.sets, set)
	return set, nil
}

func (f *fakeFactory) setAt(t *testing.T, index int) *fakeSet {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if index >= len(f.sets) {
		t.Fatalf("set index %d missing", index)
	}
	return f.sets[index]
}

func (f *fakeFactory) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sets)
}

type blockingFactory struct {
	entered chan struct{}
	once    sync.Once
}

type eventWindow string

const (
	windowBeforeConnectReturn   eventWindow = "connect-return-before"
	windowReturnBeforeActivate  eventWindow = "return-activate"
	windowActivateBeforeRunning eventWindow = "activate-running"
)

type windowFactory struct {
	t      *testing.T
	window eventWindow
	mu     sync.Mutex
	sets   []*windowSet
}

func (f *windowFactory) Connect(_ context.Context, sessionID, _ string) (ClientSet, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	identity := int64(len(f.sets) + 1)
	base := newFakeSet(f.t, sessionID, identity, identity)
	set := &windowSet{fakeSet: base}
	if len(f.sets) == 0 {
		set.window = f.window
		if f.window == windowBeforeConnectReturn {
			set.pending = true
		}
	}
	f.sets = append(f.sets, set)
	return set, nil
}

func (f *windowFactory) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sets)
}

func (f *windowFactory) firstCloseCount() int {
	f.mu.Lock()
	first := f.sets[0]
	f.mu.Unlock()
	return first.closeCount()
}

type windowSet struct {
	*fakeSet
	window  eventWindow
	pending bool
}

func (s *windowSet) Activate(handler func(pclient.Event)) error {
	if s.pending || s.window == windowReturnBeforeActivate {
		return errors.New("client failed before publication")
	}
	if err := s.fakeSet.Activate(handler); err != nil {
		return err
	}
	if s.window == windowActivateBeforeRunning {
		go handler(pclient.Event{
			Service: pclient.ServiceRecognizer,
			Kind:    pclient.EventRemoteClose,
			Err:     errors.New("event after activation"),
		})
	}
	return nil
}

type closeRaceFactory struct {
	t                *testing.T
	mu               sync.Mutex
	firstSet         *fakeSet
	attempts         int
	reconnectEntered chan struct{}
}

func (f *closeRaceFactory) Connect(ctx context.Context, sessionID, _ string) (ClientSet, error) {
	f.mu.Lock()
	f.attempts++
	attempt := f.attempts
	if attempt == 1 {
		f.firstSet = newFakeSet(f.t, sessionID, 1, 1)
		set := f.firstSet
		f.mu.Unlock()
		return set, nil
	}
	if attempt == 2 {
		close(f.reconnectEntered)
	}
	f.mu.Unlock()
	<-ctx.Done()
	return nil, ctx.Err()
}

func (f *closeRaceFactory) first() *fakeSet {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.firstSet
}

type controlledWaiter struct {
	requests chan chan error
}

func newControlledWaiter() *controlledWaiter {
	return &controlledWaiter{requests: make(chan chan error, 64)}
}

func (w *controlledWaiter) wait(ctx context.Context, delay time.Duration) <-chan error {
	if delay != outputBackpressure {
		return immediateWait(ctx, delay)
	}
	result := make(chan error, 1)
	w.requests <- result
	return result
}

func (w *controlledWaiter) discardOutputRequests(t *testing.T, count int) {
	t.Helper()
	for range count {
		select {
		case <-w.requests:
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for output waiter registration")
		}
	}
}

func (w *controlledWaiter) expireNextOutput(t *testing.T) {
	t.Helper()
	select {
	case result := <-w.requests:
		result <- nil
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for blocked output waiter")
	}
}

func (f *blockingFactory) Connect(ctx context.Context, _, _ string) (ClientSet, error) {
	f.once.Do(func() { close(f.entered) })
	<-ctx.Done()
	return nil, ctx.Err()
}
