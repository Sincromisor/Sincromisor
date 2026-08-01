package signaling

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
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

func TestOfferRegistryCapacityTombstoneAndExpiry(t *testing.T) {
	clock := newRegistryFakeClock()
	service := &registrySessionService{
		answer: rtc.Answer{
			SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000002", Revision: 1,
		},
	}
	registry, cancel := newRegistryForTest(t, service, 1, clock)
	defer cancel()
	if _, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer()); err != nil {
		t.Fatalf("first Resolve() error = %v", err)
	}
	if _, err := registry.Resolve(
		context.Background(),
		"c2ef4b63-30eb-42ee-a281-66b23ba789b4",
		[]byte("other"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("capacity error = %v, want ErrOfferCapacity", err)
	}
	service.closeSession()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferGone) {
		t.Fatalf("tombstone error = %v, want ErrOfferGone", err)
	}
	clock.Advance(2 * time.Minute)
	if _, err := registry.Resolve(
		context.Background(),
		"c2ef4b63-30eb-42ee-a281-66b23ba789b4",
		[]byte("other"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("Resolve after expiry error = %v", err)
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

func TestOfferRegistryThousandEntryBoundary(t *testing.T) {
	service := &registrySessionService{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000005", Revision: 1,
	}}
	registry, cancel := newRegistryForTest(t, service, 1000, newRegistryFakeClock())
	defer cancel()
	for index := range 1000 {
		requestID := uuidForIndex(index)
		if _, err := registry.Resolve(
			context.Background(),
			requestID,
			[]byte(requestID),
			validRTCOffer(),
		); err != nil {
			t.Fatalf("Resolve(%d) error = %v", index, err)
		}
	}
	if _, err := registry.Resolve(
		context.Background(),
		uuidForIndex(1000),
		[]byte("over"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("1001st Resolve error = %v, want ErrOfferCapacity", err)
	}
}

func TestOfferRegistryProcessCancelJoinsOwnerAndSweeper(t *testing.T) {
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	result := make(chan error, 1)
	go func() {
		_, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer())
		result <- err
	}()
	<-service.started
	cancel()
	waitCtx, cancelWait := context.WithTimeout(context.Background(), time.Second)
	defer cancelWait()
	if err := registry.Wait(waitCtx); err != nil {
		t.Fatalf("Wait() error = %v", err)
	}
	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Fatalf("owner result = %v, want process cancellation", err)
	}
}

func TestOfferRegistryPeriodicSweepRemovesExpiredEntries(t *testing.T) {
	clock := newRegistryFakeClock()
	service := &registrySessionService{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000007", Revision: 1,
	}}
	registry, cancel := newRegistryForTest(t, service, 1, clock)
	defer cancel()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	clock.Advance(2 * time.Minute)
	clock.Tick()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		registry.mu.Lock()
		count := len(registry.entries)
		registry.mu.Unlock()
		if count == 0 {
			return
		}
		select {
		case <-deadline.C:
			t.Fatalf("periodic sweep retained %d expired entries", count)
		default:
		}
	}
}

const testOfferRequestID = "8e0e18a9-243b-4c72-8e97-a1b103854e42"

func validRTCOffer() rtc.Offer {
	return rtc.Offer{SDP: "v=0\r\n", Type: "offer", TalkMode: "chat"}
}

func uuidForIndex(index int) string {
	return fmt.Sprintf("00000000-0000-4000-8000-%012d", index)
}

type registrySessionService struct {
	calls         atomic.Int32
	ownerCanceled atomic.Bool
	started       chan struct{}
	release       chan struct{}
	answer        rtc.Answer
	createErr     error

	mu       sync.Mutex
	onClosed func(string)
}

func (s *registrySessionService) Create(ctx context.Context, offer rtc.Offer) (rtc.Answer, error) {
	s.calls.Add(1)
	s.mu.Lock()
	s.onClosed = offer.OnClosed
	s.mu.Unlock()
	if s.started != nil {
		select {
		case <-s.started:
		default:
			close(s.started)
		}
	}
	if s.release != nil {
		select {
		case <-ctx.Done():
			s.ownerCanceled.Store(true)
			return rtc.Answer{}, ctx.Err()
		case <-s.release:
		}
	}
	return s.answer, s.createErr
}

func (s *registrySessionService) AddCandidate(string, *rtc.Candidate) (bool, string, error) {
	return false, "", nil
}

func (s *registrySessionService) Count() int { return 0 }

func (s *registrySessionService) closeSession() {
	s.mu.Lock()
	callback := s.onClosed
	s.mu.Unlock()
	callback(s.answer.SessionID)
}

func newRegistryForTest(
	t *testing.T,
	service SessionService,
	capacity int,
	clock OfferRegistryClock,
) (*OfferRegistry, context.CancelFunc) {
	t.Helper()
	processCtx, cancel := context.WithCancel(context.Background())
	registry, err := NewOfferRegistry(service, OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  time.Second,
		Capacity:       capacity,
		TTL:            2 * time.Minute,
		Clock:          clock,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		cancel()
		t.Fatalf("NewOfferRegistry() error = %v", err)
	}
	return registry, cancel
}

type registryFakeClock struct {
	mu    sync.Mutex
	now   time.Time
	ticks chan time.Time
}

func newRegistryFakeClock() *registryFakeClock {
	return &registryFakeClock{
		now:   time.Unix(1_700_000_000, 0),
		ticks: make(chan time.Time, 1),
	}
}

func (c *registryFakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *registryFakeClock) After(time.Duration) <-chan time.Time {
	return c.ticks
}

func (c *registryFakeClock) Tick() {
	c.ticks <- c.Now()
}

func (c *registryFakeClock) Advance(duration time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(duration)
	c.mu.Unlock()
}
