package signaling

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
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

func TestOfferRegistryOwnerPanicReleasesWaiterAndEntry(t *testing.T) {
	service := &registrySessionService{panicCreate: true}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	defer cancel()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("payload-sdp-marker"),
		validRTCOffer(),
	); err == nil {
		t.Fatal("Resolve() error = nil after owner panic")
	}
	waitRegistryEntries(t, registry, 0)
}

func TestOfferRegistrySweeperAndWaitHelperRecoverPanics(t *testing.T) {
	t.Run("sweeper", func(t *testing.T) {
		processCtx, cancel := context.WithCancel(context.Background())
		defer cancel()
		registry, err := NewOfferRegistry(&registrySessionService{}, OfferRegistryConfig{
			ProcessContext: processCtx,
			GatherTimeout:  time.Second,
			Capacity:       1,
			TTL:            time.Minute,
			Clock:          panicOfferRegistryClock{},
			Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		})
		if err != nil {
			t.Fatal(err)
		}
		ctx, stop := context.WithTimeout(context.Background(), time.Second)
		defer stop()
		if err := registry.Wait(ctx); err != nil {
			t.Fatalf("Wait() after sweeper panic = %v", err)
		}
	})

	t.Run("wait helper", func(t *testing.T) {
		registry, cancel := newRegistryForTest(t, &registrySessionService{}, 1, newRegistryFakeClock())
		defer cancel()
		result := registry.startJoin(func() { panic("payload-chat-marker") })
		if err := <-result; err == nil {
			t.Fatal("wait helper panic did not become an error")
		}
	})
}

func TestOfferRegistryLifecycleLogOmitsRequestAndPayload(t *testing.T) {
	var logs bytes.Buffer
	processCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service := &registrySessionService{answer: rtc.Answer{
		SDP:  "payload-sdp-marker",
		Type: "answer", SessionID: "01K1AF2Y0H0000000000000002", Revision: 1,
	}}
	registry, err := NewOfferRegistry(service, OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  time.Second,
		Capacity:       1,
		TTL:            time.Minute,
		Clock:          newRegistryFakeClock(),
		Logger:         slog.New(slog.NewJSONHandler(&logs, nil)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Resolve(
		context.Background(), testOfferRequestID, []byte("payload-sdp-marker"), validRTCOffer(),
	); err != nil {
		t.Fatal(err)
	}
	service.closeSession()
	for _, forbidden := range []string{testOfferRequestID, "payload-sdp-marker", "offer_request_id"} {
		if bytes.Contains(logs.Bytes(), []byte(forbidden)) {
			t.Fatalf("Offer lifecycle log exposed %q: %s", forbidden, logs.String())
		}
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

func TestOfferRegistryInFlightCountsTowardCapacity(t *testing.T) {
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
		answer: rtc.Answer{
			SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000008", Revision: 1,
		},
	}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	defer cancel()
	first := make(chan error, 1)
	go func() {
		_, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer())
		first <- err
	}()
	<-service.started
	if _, err := registry.Resolve(
		context.Background(),
		"95ff8fd1-2bcb-4dc6-bf9b-990b357f12cc",
		[]byte("other"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("in-flight capacity error = %v, want ErrOfferCapacity", err)
	}
	registry.mu.Lock()
	entryCount := len(registry.entries)
	registry.mu.Unlock()
	if entryCount != 1 || service.calls.Load() != 1 {
		t.Fatalf("failed admission left entries/calls = %d/%d, want 1/1", entryCount, service.calls.Load())
	}
	close(service.release)
	if err := <-first; err != nil {
		t.Fatalf("first Resolve() error = %v", err)
	}
}

func TestOfferRegistryDoesNotEvictLiveEntryImmediatelyBeforeTTL(t *testing.T) {
	clock := newRegistryFakeClock()
	service := &registrySessionService{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000009", Revision: 1,
	}}
	registry, cancel := newRegistryForTest(t, service, 1, clock)
	defer cancel()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("first Resolve() error = %v", err)
	}
	clock.Advance(2*time.Minute - time.Nanosecond)
	if _, err := registry.Resolve(
		context.Background(),
		"95ff8fd1-2bcb-4dc6-bf9b-990b357f12cc",
		[]byte("other"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("pre-expiry admission error = %v, want ErrOfferCapacity", err)
	}
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("pre-expiry cached Resolve() error = %v", err)
	}
	clock.Advance(time.Nanosecond)
	if _, err := registry.Resolve(
		context.Background(),
		"95ff8fd1-2bcb-4dc6-bf9b-990b357f12cc",
		[]byte("other"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("at-expiry admission error = %v", err)
	}
}

func TestOfferRegistryTimeoutLeavesNoEntryOrGoroutine(t *testing.T) {
	baseline := runtime.NumGoroutine()
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	registry, cancel := newRegistryForTestWithTimeout(
		t, service, 1, newRegistryFakeClock(), 5*time.Millisecond,
	)
	recorder := &recordingOfferRecorder{Recorder: observability.Discard()}
	registry.config.Recorder = recorder
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Resolve() error = %v, want deadline exceeded", err)
	}
	waitRegistryEntries(t, registry, 0)
	if recorder.gatherDeadlines.Load() != 1 {
		t.Fatalf("gather deadline metric = %d, want 1", recorder.gatherDeadlines.Load())
	}
	cancel()
	waitCtx, cancelWait := context.WithTimeout(context.Background(), time.Second)
	defer cancelWait()
	if err := registry.Wait(waitCtx); err != nil {
		t.Fatalf("Wait() error = %v", err)
	}
	waitForSignalingCondition(t, time.Second, func() bool {
		return runtime.NumGoroutine() <= baseline+1
	})
}

type recordingOfferRecorder struct {
	observability.Recorder
	gatherDeadlines atomic.Int32
}

func (r *recordingOfferRecorder) Deadline(stage string) {
	if stage == "gather" {
		r.gatherDeadlines.Add(1)
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
	select {
	case interval := <-clock.intervals:
		if interval != 30*time.Second {
			t.Fatalf("sweep interval = %s, want 30s", interval)
		}
	case <-time.After(time.Second):
		t.Fatal("sweeper did not request its first interval")
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
	return rtc.Offer{
		SDP: "v=0\r\n", Type: "offer", TalkMode: "chat",
		OfferRequestID: testOfferRequestID,
	}
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
	panicCreate   bool

	mu       sync.Mutex
	onClosed func(string)
}

func (s *registrySessionService) Create(ctx context.Context, offer rtc.Offer) (rtc.Answer, error) {
	s.calls.Add(1)
	if s.panicCreate {
		panic("payload-sdp-marker")
	}
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

type panicOfferRegistryClock struct{}

func (panicOfferRegistryClock) Now() time.Time { return time.Now() }
func (panicOfferRegistryClock) After(time.Duration) <-chan time.Time {
	panic("payload-candidate-marker")
}

func (s *registrySessionService) Update(context.Context, rtc.UpdateOffer) (rtc.Answer, error) {
	return rtc.Answer{}, nil
}

func (s *registrySessionService) AddCandidate(string, uint64, *rtc.Candidate) (bool, error) {
	return false, nil
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
	return newRegistryForTestWithTimeout(t, service, capacity, clock, time.Second)
}

func newRegistryForTestWithTimeout(
	t *testing.T,
	service SessionService,
	capacity int,
	clock OfferRegistryClock,
	gatherTimeout time.Duration,
) (*OfferRegistry, context.CancelFunc) {
	t.Helper()
	processCtx, cancel := context.WithCancel(context.Background())
	registry, err := NewOfferRegistry(service, OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  gatherTimeout,
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
	mu        sync.Mutex
	now       time.Time
	ticks     chan time.Time
	intervals chan time.Duration
}

func newRegistryFakeClock() *registryFakeClock {
	return &registryFakeClock{
		now:       time.Unix(1_700_000_000, 0),
		ticks:     make(chan time.Time, 1),
		intervals: make(chan time.Duration, 4),
	}
}

func (c *registryFakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *registryFakeClock) After(duration time.Duration) <-chan time.Time {
	select {
	case c.intervals <- duration:
	default:
	}
	return c.ticks
}

func waitRegistryEntries(t *testing.T, registry *OfferRegistry, want int) {
	t.Helper()
	waitForSignalingCondition(t, time.Second, func() bool {
		registry.mu.Lock()
		defer registry.mu.Unlock()
		return len(registry.entries) == want
	})
}

func waitForSignalingCondition(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		if condition() {
			return
		}
		select {
		case <-deadline.C:
			t.Fatal("condition did not converge before timeout")
		case <-ticker.C:
		}
	}
}

func (c *registryFakeClock) Tick() {
	c.ticks <- c.Now()
}

func (c *registryFakeClock) Advance(duration time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(duration)
	c.mu.Unlock()
}
