package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/signaling/offer"
)

type fakeSessions struct {
	answer             rtc.Answer
	createErr          error
	waitForContext     bool
	createCanceled     bool
	onClosed           func(string)
	candidateApplied   bool
	candidateReason    string
	candidateErr       error
	lastCandidate      *rtc.Candidate
	lastRevision       uint64
	updateAnswer       rtc.Answer
	updateErr          error
	activeSessions     atomic.Int32
	reservations       atomic.Int32
	resourceBuildCalls atomic.Int32
	lastOffer          rtc.Offer
}

func (f *fakeSessions) Update(_ context.Context, _ rtc.UpdateOffer) (rtc.Answer, error) {
	return f.updateAnswer, f.updateErr
}

func (f *fakeSessions) Create(ctx context.Context, offer rtc.Offer) (rtc.Answer, error) {
	f.lastOffer = offer
	f.onClosed = offer.OnClosed
	if errors.Is(f.createErr, rtc.ErrSessionCapacity) {
		return rtc.Answer{}, f.createErr
	}
	f.resourceBuildCalls.Add(1)
	if f.waitForContext {
		<-ctx.Done()
		f.createCanceled = true
		return rtc.Answer{}, ctx.Err()
	}
	return f.answer, f.createErr
}

func (f *fakeSessions) AddCandidate(_ string, revision uint64, candidate *rtc.Candidate) (bool, error) {
	f.lastRevision = revision
	f.lastCandidate = candidate
	return !f.candidateApplied, f.candidateErr
}

func (f *fakeSessions) Count() int {
	return 1
}

func newTestServer(t *testing.T, sessions SessionService, stunURL string) *Server {
	t.Helper()
	return newTestServerWithTimeout(t, sessions, stunURL, time.Second)
}

func newTestServerWithTimeout(
	t *testing.T,
	sessions SessionService,
	stunURL string,
	gatherTimeout time.Duration,
) *Server {
	t.Helper()
	offers := newTestOfferRegistry(t, sessions, gatherTimeout)
	return New(
		sessions,
		offers,
		t.TempDir(),
		stunURL,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
}

func newTestOfferRegistry(
	t *testing.T,
	sessions SessionService,
	gatherTimeout time.Duration,
) *offer.Registry {
	t.Helper()
	processCtx, cancel := context.WithCancel(context.Background())
	offers, err := offer.New(sessions, offer.Config{
		ProcessContext: processCtx,
		GatherTimeout:  gatherTimeout,
		Capacity:       1000,
		TTL:            2 * time.Minute,
		Clock:          offer.SystemClock(),
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		cancel()
		t.Fatalf("offer.New() error = %v", err)
	}
	t.Cleanup(func() {
		cancel()
		waitCtx, cancelWait := context.WithTimeout(context.Background(), time.Second)
		defer cancelWait()
		if waitErr := offers.Wait(waitCtx); waitErr != nil {
			t.Errorf("Registry.Wait(test cleanup) error = %v", waitErr)
		}
	})
	return offers
}

func performRequest(handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
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

func decodeResponse(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.Unmarshal(response.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, response.Body.String())
	}
}
