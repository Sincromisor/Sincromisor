package pipeline

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

func (h *fixtureWebSocketHarness) fail(service pclient.Service, fault websocketFault) {
	state := h.states[service]
	state.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(state.conns))
	for conn := range state.conns {
		conns = append(conns, conn)
	}
	state.mu.Unlock()
	for _, conn := range conns {
		switch fault {
		case faultDecode:
			_ = conn.Write(context.Background(), websocket.MessageBinary, []byte{0xc1})
		case faultNormal:
			go func(conn *websocket.Conn) {
				_ = conn.Close(websocket.StatusNormalClosure, "test normal close")
			}(conn)
		case faultRemote:
			go func(conn *websocket.Conn) {
				_ = conn.Close(websocket.StatusGoingAway, "test remote close")
			}(conn)
		}
	}
}

func (h *fixtureWebSocketHarness) acceptCounts() map[pclient.Service]int64 {
	result := make(map[pclient.Service]int64, len(h.states))
	for service, state := range h.states {
		result[service] = state.accepted.Load()
	}
	return result
}

func (h *fixtureWebSocketHarness) assertAcceptedDelta(
	t *testing.T,
	before map[pclient.Service]int64,
	delta int64,
) {
	t.Helper()
	for service, state := range h.states {
		if got := state.accepted.Load(); got != before[service]+delta {
			t.Fatalf("%s accepted count = %d, want %d", service, got, before[service]+delta)
		}
	}
}

func (h *fixtureWebSocketHarness) waitActive(t *testing.T, want int64) {
	t.Helper()
	waitFor(t, func() bool {
		var total int64
		for _, state := range h.states {
			total += state.active.Load()
		}
		return total == want
	})
}

func (h *fixtureWebSocketHarness) processorHistoryLength() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.processorHistories) == 0 {
		return -1
	}
	return h.processorHistories[len(h.processorHistories)-1]
}

func (h *fixtureWebSocketHarness) synthRequestCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.synthRequests
}

func (h *fixtureWebSocketHarness) assertStrictExtractorIdentities(t *testing.T) {
	t.Helper()
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.extractorIDs) < 2 {
		t.Fatalf("extractor identity count = %d, want at least 2", len(h.extractorIDs))
	}
	for index := 1; index < len(h.extractorIDs); index++ {
		previous, current := h.extractorIDs[index-1], h.extractorIDs[index]
		if current.speechID <= previous.speechID || current.sequenceID <= previous.sequenceID {
			t.Fatalf("extractor identities did not increase: previous=%+v current=%+v", previous, current)
		}
	}
}

func (h *fixtureWebSocketHarness) recordError(err error) {
	h.mu.Lock()
	h.errs = append(h.errs, err)
	h.mu.Unlock()
}

func (h *fixtureWebSocketHarness) assertNoError(t *testing.T) {
	t.Helper()
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.errs) > 0 {
		t.Fatalf("fixture WebSocket server errors: %v", h.errs)
	}
}

func (h *fixtureWebSocketHarness) Close() {
	for _, state := range h.states {
		state.mu.Lock()
		for conn := range state.conns {
			_ = conn.CloseNow()
		}
		state.mu.Unlock()
		state.server.Close()
	}
}

type fixtureResolver struct {
	endpoints         map[discovery.Service]discovery.Endpoint
	failNextExtractor atomic.Bool
}

func newFixtureResolver(t *testing.T, states map[pclient.Service]*fixtureServiceState) *fixtureResolver {
	t.Helper()
	result := &fixtureResolver{endpoints: make(map[discovery.Service]discovery.Endpoint)}
	for service, state := range states {
		host, portText, err := net.SplitHostPort(state.server.Listener.Addr().String())
		if err != nil {
			t.Fatalf("split fixture server address: %v", err)
		}
		port, err := strconv.Atoi(portText)
		if err != nil {
			t.Fatalf("parse fixture server port: %v", err)
		}
		result.endpoints[discovery.Service(service)] = discovery.Endpoint{
			Host: host, Port: uint16(port), Source: discovery.EndpointSourceConsul,
		}
	}
	return result
}

func (r *fixtureResolver) Resolve(
	_ context.Context,
	service discovery.Service,
) (discovery.Endpoint, error) {
	if service == discovery.ServiceExtractor && r.failNextExtractor.Swap(false) {
		return discovery.Endpoint{}, errors.New("injected reconnect resolve failure")
	}
	endpoint, found := r.endpoints[service]
	if !found {
		return discovery.Endpoint{}, errors.New("unknown fixture service")
	}
	return endpoint, nil
}

type integrationWaiter struct {
	mu      sync.Mutex
	retries []time.Duration
}

func (w *integrationWaiter) wait(ctx context.Context, delay time.Duration) <-chan error {
	if delay == outputBackpressure {
		result := make(chan error, 1)
		go func() {
			<-ctx.Done()
			result <- ctx.Err()
		}()
		return result
	}
	w.mu.Lock()
	w.retries = append(w.retries, delay)
	w.mu.Unlock()
	return immediateWait(ctx, delay)
}

func (w *integrationWaiter) retryCount() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	return len(w.retries)
}

func (w *integrationWaiter) lastRetry() time.Duration {
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(w.retries) == 0 {
		return 0
	}
	return w.retries[len(w.retries)-1]
}

func newWebSocketCoordinator(
	t *testing.T,
	harness *fixtureWebSocketHarness,
) (*Coordinator, *integrationWaiter) {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	factory, err := pclient.NewSetFactory(harness.resolver, logger, func() time.Time {
		return time.Unix(1_700_000_000, 125_000_000)
	})
	if err != nil {
		t.Fatalf("NewSetFactory() error = %v", err)
	}
	waiter := &integrationWaiter{}
	coordinator, err := newCoordinatorWithHooks(
		factory,
		logger,
		func(cap time.Duration) (time.Duration, error) { return cap, nil },
		waiter.wait,
	)
	if err != nil {
		t.Fatalf("newCoordinatorWithHooks() error = %v", err)
	}
	return coordinator, waiter
}

func runtimeGoroutines() int {
	return runtime.NumGoroutine()
}
