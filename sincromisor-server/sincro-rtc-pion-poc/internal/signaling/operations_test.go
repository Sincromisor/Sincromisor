package signaling

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

func TestOperationalEndpointsAndDrainAdmission(t *testing.T) {
	state := NewProcessState()
	metrics := observability.NewRegistry()
	sessions := &fakeSessions{}
	server := New(sessions, nil, t.TempDir(), "", slog.New(slog.NewTextHandler(io.Discard, nil)),
		Options{State: state, Recorder: metrics, Metrics: metrics.Handler()})
	handler := server.Handler()

	assertStatus(t, handler, http.MethodGet, livenessPath, http.StatusOK)
	assertStatus(t, handler, http.MethodGet, readinessPath, http.StatusServiceUnavailable)
	state.MarkReady()
	assertStatus(t, handler, http.MethodGet, readinessPath, http.StatusOK)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, statusesPath, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("statuses status = %d", response.Code)
	}
	var status statusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if status.Sessions != 1 || !status.Ready || status.Draining {
		t.Fatalf("statuses = %+v", status)
	}
	assertStatus(t, handler, http.MethodPost, statusesPath, http.StatusMethodNotAllowed)

	state.BeginDrain()
	assertStatus(t, handler, http.MethodGet, readinessPath, http.StatusServiceUnavailable)
	body := `{"sdp":"payload-sdp-marker","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1}`
	request := httptest.NewRequest(http.MethodPost, offerPath, strings.NewReader(body))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || sessions.resourceBuildCalls.Load() != 0 {
		t.Fatalf("draining offer = status %d, create calls %d", response.Code, sessions.resourceBuildCalls.Load())
	}
}

func TestMutationPanicClosesKnownSessionAndReturns500(t *testing.T) {
	sessions := &panicSessions{}
	server := New(sessions, nil, t.TempDir(), "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	server.offers = &OfferRegistry{config: OfferRegistryConfig{GatherTimeout: time.Second}}
	body := `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","session_id":"01K1AF2Y0H0000000000000000","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":2}`
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, offerPath, strings.NewReader(body)))
	if response.Code != http.StatusInternalServerError || sessions.closedReason != "panic" {
		t.Fatalf("panic response = %d, close reason = %q", response.Code, sessions.closedReason)
	}
}

type panicSessions struct{ closedReason string }

func (*panicSessions) Create(context.Context, rtc.Offer) (rtc.Answer, error) {
	return rtc.Answer{}, nil
}
func (*panicSessions) Update(context.Context, rtc.UpdateOffer) (rtc.Answer, error) {
	panic("payload-chat-marker")
}
func (*panicSessions) AddCandidate(string, uint64, *rtc.Candidate) (bool, error) { return false, nil }
func (*panicSessions) Count() int                                                { return 1 }
func (p *panicSessions) CloseSession(_ string, reason string)                    { p.closedReason = reason }

func TestOperationalLogsDoNotContainOfferPayloadMarker(t *testing.T) {
	var logs bytes.Buffer
	state := NewProcessState()
	state.BeginDrain()
	server := New(&fakeSessions{}, nil, t.TempDir(), "", slog.New(slog.NewJSONHandler(&logs, nil)),
		Options{State: state})
	body := `{"sdp":"payload-sdp-marker","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1}`
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, offerPath, strings.NewReader(body)))
	if strings.Contains(logs.String(), "payload-sdp-marker") {
		t.Fatalf("structured log leaked payload: %s", logs.String())
	}
}

func assertStatus(t *testing.T, handler http.Handler, method, path string, want int) {
	t.Helper()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(method, path, nil))
	if response.Code != want {
		t.Fatalf("%s %s = %d, want %d", method, path, response.Code, want)
	}
}
