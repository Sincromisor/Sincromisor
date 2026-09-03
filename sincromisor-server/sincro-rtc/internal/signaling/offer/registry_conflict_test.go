package offer

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
)

func TestOfferRegistrySingleFlightAndConflict(t *testing.T) {
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
		answer: rtc.Answer{
			SDP: "candidate-complete", Type: "answer", SessionID: "01K1AF2Y0H0000000000000000", Revision: 1,
		},
	}
	registry, cancel := newRegistryForTest(t, service, 1000, newRegistryFakeClock())
	defer cancel()

	const callers = 100
	results := make(chan rtc.Answer, callers)
	errorsResult := make(chan error, callers)
	var callersWG sync.WaitGroup
	for range callers {
		callersWG.Add(1)
		go func() {
			defer callersWG.Done()
			answer, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer())
			results <- answer
			errorsResult <- err
		}()
	}
	<-service.started
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("different"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferConflict) {
		t.Fatalf("different SDP error = %v, want ErrOfferConflict", err)
	}
	close(service.release)
	callersWG.Wait()
	close(results)
	close(errorsResult)
	for err := range errorsResult {
		if err != nil {
			t.Fatalf("matching waiter error = %v", err)
		}
	}
	for answer := range results {
		if answer != service.answer {
			t.Fatalf("answer = %+v, want %+v", answer, service.answer)
		}
	}
	if got := service.calls.Load(); got != 1 {
		t.Fatalf("Create calls = %d, want 1", got)
	}
}

func TestOfferRegistryWaiterCancelDoesNotCancelOwner(t *testing.T) {
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
		answer: rtc.Answer{
			SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000001", Revision: 1,
		},
	}
	registry, cancel := newRegistryForTest(t, service, 2, newRegistryFakeClock())
	defer cancel()
	waiterCtx, cancelWaiter := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, err := registry.Resolve(waiterCtx, testOfferRequestID, []byte("same"), validRTCOffer())
		result <- err
	}()
	<-service.started
	cancelWaiter()
	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Fatalf("waiter error = %v, want canceled", err)
	}
	close(service.release)
	answer, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer())
	if err != nil || answer != service.answer {
		t.Fatalf("cached Resolve() = %+v, %v", answer, err)
	}
	if service.ownerCanceled.Load() {
		t.Fatal("request cancellation propagated to owner")
	}
}

func TestOfferRegistryFailureIsNotCached(t *testing.T) {
	service := &registrySessionService{createErr: errors.New("invalid sdp")}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	defer cancel()
	for range 2 {
		if _, err := registry.Resolve(
			context.Background(),
			testOfferRequestID,
			[]byte("bad"),
			validRTCOffer(),
		); err == nil {
			t.Fatal("Resolve() error = nil")
		}
	}
	if got := service.calls.Load(); got != 2 {
		t.Fatalf("Create calls = %d, want 2 after failure removal", got)
	}
}

func TestOfferRegistryAllWaitersCancelBeforeOwnerFailure(t *testing.T) {
	service := &registrySessionService{
		started:   make(chan struct{}),
		release:   make(chan struct{}),
		createErr: errors.New("owner failed"),
	}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	defer cancel()
	const waiterCount = 32
	results := make(chan error, waiterCount)
	cancels := make([]context.CancelFunc, 0, waiterCount)
	for range waiterCount {
		waiterCtx, cancelWaiter := context.WithCancel(context.Background())
		cancels = append(cancels, cancelWaiter)
		go func() {
			_, err := registry.Resolve(waiterCtx, testOfferRequestID, []byte("same"), validRTCOffer())
			results <- err
		}()
	}
	<-service.started
	waitForSignalingCondition(t, time.Second, func() bool {
		registry.mu.Lock()
		defer registry.mu.Unlock()
		return registry.entries[testOfferRequestID].waiters == waiterCount
	})
	for _, cancelWaiter := range cancels {
		cancelWaiter()
	}
	for range waiterCount {
		if err := <-results; !errors.Is(err, context.Canceled) {
			t.Fatalf("waiter error = %v, want context canceled", err)
		}
	}
	close(service.release)
	waitRegistryEntries(t, registry, 0)
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); !errors.Is(err, service.createErr) {
		t.Fatalf("retry error = %v, want fresh owner failure", err)
	}
	if got := service.calls.Load(); got != 2 {
		t.Fatalf("Create calls = %d, want retry to start second owner", got)
	}
}
