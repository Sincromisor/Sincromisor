package offer

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
)

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

// registrySessionService は所有処理の開始・取消・終了通知を制御できるSession境界である。
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

// panicRegistryClock は定期回収処理のpanic境界を再現する。
type panicRegistryClock struct{}

func (panicRegistryClock) Now() time.Time { return time.Now() }
func (panicRegistryClock) After(time.Duration) <-chan time.Time {
	panic("payload-candidate-marker")
}

func (s *registrySessionService) closeSession() {
	s.mu.Lock()
	callback := s.onClosed
	s.mu.Unlock()
	callback(s.answer.SessionID)
}

func newRegistryForTest(
	t *testing.T,
	service Creator,
	capacity int,
	clock Clock,
) (*Registry, context.CancelFunc) {
	return newRegistryForTestWithTimeout(t, service, capacity, clock, time.Second)
}

// newRegistryForTestWithTimeout は試験用の処理文脈を作り、その取消責務を呼び出し元へ返す。
func newRegistryForTestWithTimeout(
	t *testing.T,
	service Creator,
	capacity int,
	clock Clock,
	gatherTimeout time.Duration,
) (*Registry, context.CancelFunc) {
	t.Helper()
	processCtx, cancel := context.WithCancel(context.Background())
	registry, err := New(service, Config{
		ProcessContext: processCtx,
		GatherTimeout:  gatherTimeout,
		Capacity:       capacity,
		TTL:            2 * time.Minute,
		Clock:          clock,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		cancel()
		t.Fatalf("New() error = %v", err)
	}
	return registry, cancel
}

// registryFakeClock は期限回収の時刻と周期通知を試験側から進める。
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

func waitRegistryEntries(t *testing.T, registry *Registry, want int) {
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
