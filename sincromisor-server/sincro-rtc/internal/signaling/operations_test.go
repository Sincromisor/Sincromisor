package signaling

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
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
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, metricsPath, nil))
	if response.Code != http.StatusOK ||
		!strings.Contains(response.Header().Get("Content-Type"), "text/plain") ||
		!strings.Contains(response.Body.String(), "sincro_rtc_signaling_requests_total") {
		t.Fatalf("metrics endpoint = status %d, content-type %q", response.Code, response.Header().Get("Content-Type"))
	}

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
	sessions := &panicSessions{panicUpdate: true}
	metrics := observability.NewRegistry()
	server := New(
		sessions,
		nil,
		t.TempDir(),
		"",
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		Options{Recorder: metrics},
	)
	server.offers = &OfferRegistry{config: OfferRegistryConfig{GatherTimeout: time.Second}}
	body := `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","session_id":"01K1AF2Y0H0000000000000000","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":2}`
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, offerPath, strings.NewReader(body)))
	if response.Code != http.StatusInternalServerError || sessions.closedReason != "panic" {
		t.Fatalf("panic response = %d, close reason = %q", response.Code, sessions.closedReason)
	}
	metricsResponse := httptest.NewRecorder()
	metrics.Handler().ServeHTTP(metricsResponse, httptest.NewRequest(http.MethodGet, metricsPath, nil))
	metricsBody := metricsResponse.Body.String()
	if !strings.Contains(
		metricsBody,
		`sincro_rtc_signaling_requests_total{endpoint="offer",status_class="5xx"} 1`,
	) || !strings.Contains(
		metricsBody,
		`sincro_rtc_signaling_duration_seconds_count{endpoint="offer"} 1`,
	) {
		t.Fatalf("panic signaling metrics missing:\n%s", metricsBody)
	}
}

func TestMutationPanicAfterPartialResponseDiscardsBodyAndClosesSession(t *testing.T) {
	sessions := &panicSessions{}
	server := New(sessions, nil, t.TempDir(), "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	server.offers = &OfferRegistry{config: OfferRegistryConfig{GatherTimeout: time.Second}}
	server.mutationHook = func() { panic("payload-candidate-marker") }
	body := `{"session_id":"01K1AF2Y0H0000000000000000","offer_revision":2,"candidate":null}`
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, candidatePath, strings.NewReader(body)))
	if response.Code != http.StatusInternalServerError || sessions.closedReason != "panic" {
		t.Fatalf("partial panic response = %d, close reason = %q", response.Code, sessions.closedReason)
	}
	if strings.Contains(response.Body.String(), `"status":true`) {
		t.Fatalf("partial success body leaked through 500: %s", response.Body.String())
	}
}

func TestRecoverHTTPBuffersPartialResponseBefore500(t *testing.T) {
	server := New(&fakeSessions{}, nil, t.TempDir(), "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	handler := server.recoverHTTP(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusAccepted)
		_, _ = writer.Write([]byte("partial-success"))
		panic("payload-audio-marker")
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "partial-success") {
		t.Fatalf("buffered panic response = %d %q", response.Code, response.Body.String())
	}
}

type panicSessions struct {
	closedReason string
	panicUpdate  bool
}

func (*panicSessions) Create(context.Context, rtc.Offer) (rtc.Answer, error) {
	return rtc.Answer{}, nil
}
func (p *panicSessions) Update(context.Context, rtc.UpdateOffer) (rtc.Answer, error) {
	if p.panicUpdate {
		panic("payload-chat-marker")
	}
	return rtc.Answer{SessionID: "01K1AF2Y0H0000000000000000"}, nil
}
func (*panicSessions) AddCandidate(string, uint64, *rtc.Candidate) (bool, error) {
	return false, nil
}
func (*panicSessions) Count() int                             { return 1 }
func (p *panicSessions) CloseSession(_ string, reason string) { p.closedReason = reason }

func TestOperationalLogsDoNotContainPayloadMarkers(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))

	// Exercise rejection and panic paths because those are the paths most likely
	// to accidentally attach a request body or recovered panic value to a log.
	state := NewProcessState()
	state.BeginDrain()
	server := New(&fakeSessions{}, nil, t.TempDir(), "", logger,
		Options{State: state})
	body := `{"sdp":"payload-sdp-marker","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1}`
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, offerPath, strings.NewReader(body)))

	candidateServer := New(
		&fakeSessions{candidateErr: fmt.Errorf("payload-candidate-marker")},
		nil,
		t.TempDir(),
		"",
		logger,
	)
	body = `{"session_id":"01K1AF2Y0H0000000000000000","offer_revision":2,"candidate":{"candidate":"candidate:payload-candidate-marker"}}`
	candidateServer.Handler().ServeHTTP(
		httptest.NewRecorder(),
		httptest.NewRequest(http.MethodPost, candidatePath, strings.NewReader(body)),
	)

	updateServer := New(&panicSessions{panicUpdate: true}, nil, t.TempDir(), "", logger)
	updateServer.offers = &OfferRegistry{config: OfferRegistryConfig{GatherTimeout: time.Second}}
	body = `{"sdp":"payload-chat-marker","type":"offer","talk_mode":"chat","session_id":"01K1AF2Y0H0000000000000000","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":2}`
	updateServer.Handler().ServeHTTP(
		httptest.NewRecorder(),
		httptest.NewRequest(http.MethodPost, offerPath, strings.NewReader(body)),
	)

	audioServer := New(&fakeSessions{}, nil, t.TempDir(), "", logger)
	audioServer.recoverHTTP(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("payload-audio-marker")
	})).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	for _, marker := range []string{
		"payload-sdp-marker",
		"payload-candidate-marker",
		"payload-chat-marker",
		"payload-audio-marker",
	} {
		if strings.Contains(logs.String(), marker) {
			t.Fatalf("structured log leaked %q: %s", marker, logs.String())
		}
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
