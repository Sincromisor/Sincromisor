package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

func TestInitialOfferContractFixtures(t *testing.T) {
	requestBytes, err := os.ReadFile("testdata/initial_offer_request.json")
	if err != nil {
		t.Fatalf("read request fixture: %v", err)
	}
	var request offerRequest
	if err := json.Unmarshal(requestBytes, &request); err != nil {
		t.Fatalf("decode request fixture: %v", err)
	}
	if !validUUID(request.OfferRequestID) || request.OfferRevision != 1 {
		t.Fatalf("request fixture identity = %q/%d", request.OfferRequestID, request.OfferRevision)
	}
	var previousSessionID string
	if err := json.Unmarshal(request.PreviousSessionID, &previousSessionID); err != nil {
		t.Fatalf("request fixture previous_session_id type: %v", err)
	}
	if _, err := ulid.ParseStrict(previousSessionID); err != nil {
		t.Fatalf("request fixture previous_session_id: %v", err)
	}

	answerBytes, err := os.ReadFile("testdata/initial_offer_answer.json")
	if err != nil {
		t.Fatalf("read answer fixture: %v", err)
	}
	var answer rtc.Answer
	if err := json.Unmarshal(answerBytes, &answer); err != nil {
		t.Fatalf("decode answer fixture: %v", err)
	}
	if answer.Revision != 1 {
		t.Fatalf("answer fixture revision = %d, want 1", answer.Revision)
	}
	if _, err := ulid.ParseStrict(answer.SessionID); err != nil {
		t.Fatalf("answer fixture session_id: %v", err)
	}
}

func TestConfigResponse(t *testing.T) {
	server := newTestServer(t, &fakeSessions{}, "stun:stun.example.test")
	response := performRequest(server.Handler(), http.MethodGet, configPath, "")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.Code)
	}
	var got configResponse
	decodeResponse(t, response, &got)
	if got.OfferURL != offerPath || got.CandidateURL != candidatePath {
		t.Fatalf("config = %+v, want existing endpoint paths", got)
	}
	if len(got.ICEServers) != 1 || got.ICEServers[0].URLs != "stun:stun.example.test" {
		t.Fatalf("iceServers = %+v, want configured STUN", got.ICEServers)
	}
}

func TestConfigResponseUsesEmptyArrayWithoutSTUN(t *testing.T) {
	server := newTestServer(t, &fakeSessions{}, "")
	response := performRequest(server.Handler(), http.MethodGet, configPath, "")
	if !strings.Contains(response.Body.String(), `"iceServers":[]`) {
		t.Fatalf("body = %s, want empty iceServers array", response.Body.String())
	}
}

func TestOfferBoundary(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		fake       *fakeSessions
		wantStatus int
	}{
		{
			name: "valid initial offer",
			body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1}`,
			fake: &fakeSessions{answer: rtc.Answer{
				SDP: "v=0\r\n", Type: "answer", SessionID: "01TEST",
			}},
			wantStatus: http.StatusOK,
		},
		{
			name:       "malformed json",
			body:       `{"sdp":`,
			fake:       &fakeSessions{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "malformed sdp",
			body:       `{"sdp":"invalid","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1}`,
			fake:       &fakeSessions{createErr: errors.New("set remote offer")},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "update offer",
			body:       `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","session_id":"old","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1}`,
			fake:       &fakeSessions{},
			wantStatus: http.StatusNotImplemented,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := newTestServer(t, test.fake, "")
			response := performRequest(server.Handler(), http.MethodPost, offerPath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, test.wantStatus, response.Body.String())
			}
		})
	}
}

func TestOfferGatheringTimeoutReturns504(t *testing.T) {
	fake := &fakeSessions{waitForContext: true}
	server := newTestServerWithTimeout(t, fake, "", time.Millisecond)
	response := performRequest(
		server.Handler(),
		http.MethodPost,
		offerPath,
		`{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1}`,
	)
	if response.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want 504; body=%s", response.Code, response.Body.String())
	}
	if !fake.createCanceled {
		t.Fatal("Create did not observe gathering context cancellation")
	}
	server.offers.mu.Lock()
	entryCount := len(server.offers.entries)
	server.offers.mu.Unlock()
	if entryCount != 0 {
		t.Fatalf("timeout retained %d registry entries, want 0", entryCount)
	}
}

func TestInitialOfferSchemaAndByteBoundaries(t *testing.T) {
	validPrefix := `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":1`
	tests := []struct {
		name       string
		body       string
		wantStatus int
	}{
		{name: "missing request id", body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_revision":1}`, wantStatus: http.StatusBadRequest},
		{name: "malformed uuid", body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"not-uuid","offer_revision":1}`, wantStatus: http.StatusBadRequest},
		{name: "wrong revision", body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":2}`, wantStatus: http.StatusBadRequest},
		{name: "revision type", body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":"1"}`, wantStatus: http.StatusBadRequest},
		{name: "null session id is present", body: validPrefix + `,"session_id":null}`, wantStatus: http.StatusBadRequest},
		{name: "empty session id is present", body: validPrefix + `,"session_id":""}`, wantStatus: http.StatusBadRequest},
		{name: "numeric session id is present", body: validPrefix + `,"session_id":1}`, wantStatus: http.StatusBadRequest},
		{name: "object session id is present", body: validPrefix + `,"session_id":{}}`, wantStatus: http.StatusBadRequest},
		{name: "malformed previous ulid", body: validPrefix + `,"previous_session_id":"old"}`, wantStatus: http.StatusBadRequest},
		{name: "null previous ulid", body: validPrefix + `,"previous_session_id":null}`, wantStatus: http.StatusBadRequest},
		{name: "empty previous ulid", body: validPrefix + `,"previous_session_id":""}`, wantStatus: http.StatusBadRequest},
		{name: "numeric previous ulid", body: validPrefix + `,"previous_session_id":1}`, wantStatus: http.StatusBadRequest},
		{name: "object previous ulid", body: validPrefix + `,"previous_session_id":{}}`, wantStatus: http.StatusBadRequest},
		{name: "valid previous ulid", body: validPrefix + `,"previous_session_id":"01K1AF2Y0H0000000000000000"}`, wantStatus: http.StatusOK},
		{name: "sdp exact limit", body: validOfferBody(strings.Repeat("s", maxSDPBytes)), wantStatus: http.StatusOK},
		{name: "sdp over limit", body: validOfferBody(strings.Repeat("s", maxSDPBytes+1)), wantStatus: http.StatusRequestEntityTooLarge},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fake := &fakeSessions{answer: rtc.Answer{
				SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000003", Revision: 1,
			}}
			response := performRequest(newTestServer(t, fake, "").Handler(), http.MethodPost, offerPath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, test.wantStatus, response.Body.String())
			}
		})
	}
}

func TestRequestBodyBoundary(t *testing.T) {
	base := validOfferBody("v=0\r\n")
	exact := base + strings.Repeat(" ", maxRequestBytes-len(base))
	over := exact + " "
	for _, test := range []struct {
		name       string
		body       string
		wantStatus int
	}{
		{name: "exact", body: exact, wantStatus: http.StatusOK},
		{name: "over", body: over, wantStatus: http.StatusRequestEntityTooLarge},
	} {
		t.Run(test.name, func(t *testing.T) {
			fake := &fakeSessions{answer: rtc.Answer{
				SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000004", Revision: 1,
			}}
			response := performRequest(newTestServer(t, fake, "").Handler(), http.MethodPost, offerPath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
		})
	}
}

func TestInitialOfferRegistryStatusMapping(t *testing.T) {
	fake := &fakeSessions{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000006", Revision: 1,
	}}
	processCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	offers, err := NewOfferRegistry(fake, OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  time.Second,
		Capacity:       1,
		TTL:            2 * time.Minute,
		Clock:          SystemOfferRegistryClock(),
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		t.Fatalf("NewOfferRegistry() error = %v", err)
	}
	server := New(fake, offers, t.TempDir(), "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	handler := server.Handler()
	if response := performRequest(
		handler,
		http.MethodPost,
		offerPath,
		validOfferBody("first"),
	); response.Code != http.StatusOK {
		t.Fatalf("first status = %d", response.Code)
	}
	conflict := strings.Replace(validOfferBody("different"), "different", "changed", 1)
	if response := performRequest(handler, http.MethodPost, offerPath, conflict); response.Code != http.StatusConflict {
		t.Fatalf("conflict status = %d, want 409", response.Code)
	}
	capacityBody := strings.Replace(
		validOfferBody("second"),
		"8e0e18a9-243b-4c72-8e97-a1b103854e42",
		"95ff8fd1-2bcb-4dc6-bf9b-990b357f12cc",
		1,
	)
	if response := performRequest(handler, http.MethodPost, offerPath, capacityBody); response.Code != http.StatusTooManyRequests {
		t.Fatalf("capacity status = %d, want 429", response.Code)
	}
	fake.onClosed(fake.answer.SessionID)
	if response := performRequest(
		handler,
		http.MethodPost,
		offerPath,
		validOfferBody("first"),
	); response.Code != http.StatusGone {
		t.Fatalf("tombstone status = %d, want 410", response.Code)
	}
}

func TestSessionCapacityMapsTo429(t *testing.T) {
	fake := &fakeSessions{createErr: rtc.ErrSessionCapacity}
	server := newTestServer(t, fake, "")
	response := performRequest(
		server.Handler(),
		http.MethodPost,
		offerPath,
		validOfferBody("v=0\r\n"),
	)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", response.Code)
	}
	server.offers.mu.Lock()
	entryCount := len(server.offers.entries)
	server.offers.mu.Unlock()
	if entryCount != 0 {
		t.Fatalf("session 429 retained %d registry entries, want 0", entryCount)
	}
}

func validOfferBody(sdp string) string {
	encoded, _ := json.Marshal(map[string]any{
		"sdp": sdp, "type": "offer", "talk_mode": "chat",
		"offer_request_id": "8e0e18a9-243b-4c72-8e97-a1b103854e42",
		"offer_revision":   1,
	})
	return string(encoded)
}

func TestCandidateBoundary(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		fake       *fakeSessions
		wantStatus int
		wantApply  bool
	}{
		{
			name:       "valid candidate",
			body:       `{"session_id":"active","candidate":{"candidate":"candidate:1 1 udp 1 127.0.0.1 5000 typ host","sdpMid":"0","sdpMLineIndex":0}}`,
			fake:       &fakeSessions{candidateApplied: true},
			wantStatus: http.StatusOK,
			wantApply:  true,
		},
		{
			name:       "end of candidates",
			body:       `{"session_id":"active","candidate":null}`,
			fake:       &fakeSessions{candidateApplied: true},
			wantStatus: http.StatusOK,
			wantApply:  true,
		},
		{
			name:       "unknown session",
			body:       `{"session_id":"unknown","candidate":null}`,
			fake:       &fakeSessions{candidateReason: "unknown_session"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "closed session",
			body:       `{"session_id":"closed","candidate":null}`,
			fake:       &fakeSessions{candidateReason: "session_closed"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "malformed json",
			body:       `{"session_id":`,
			fake:       &fakeSessions{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "malformed candidate",
			body:       `{"session_id":"active","candidate":{"candidate":""}}`,
			fake:       &fakeSessions{candidateErr: errors.New("candidate string is required")},
			wantStatus: http.StatusBadRequest,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := newTestServer(t, test.fake, "")
			response := performRequest(server.Handler(), http.MethodPost, candidatePath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, test.wantStatus, response.Body.String())
			}
			if test.wantStatus == http.StatusOK {
				var got candidateResponse
				decodeResponse(t, response, &got)
				if got.Status != test.wantApply {
					t.Fatalf("status field = %v, want %v", got.Status, test.wantApply)
				}
			}
		})
	}
}

func TestStaticAndAPIPrecedence(t *testing.T) {
	frontendDir := t.TempDir()
	fake := &fakeSessions{}
	offers := newTestOfferRegistry(t, fake, time.Second)
	server := New(fake, offers, frontendDir, "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	response := performRequest(server.Handler(), http.MethodGet, apiPrefix+"missing", "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown API status = %d, want 404", response.Code)
	}
}

type fakeSessions struct {
	answer           rtc.Answer
	createErr        error
	waitForContext   bool
	createCanceled   bool
	onClosed         func(string)
	candidateApplied bool
	candidateReason  string
	candidateErr     error
}

func (f *fakeSessions) Create(ctx context.Context, offer rtc.Offer) (rtc.Answer, error) {
	f.onClosed = offer.OnClosed
	if f.waitForContext {
		<-ctx.Done()
		f.createCanceled = true
		return rtc.Answer{}, ctx.Err()
	}
	return f.answer, f.createErr
}

func (f *fakeSessions) AddCandidate(_ string, _ *rtc.Candidate) (bool, string, error) {
	return f.candidateApplied, f.candidateReason, f.candidateErr
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
) *OfferRegistry {
	t.Helper()
	processCtx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	offers, err := NewOfferRegistry(sessions, OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  gatherTimeout,
		Capacity:       1000,
		TTL:            2 * time.Minute,
		Clock:          SystemOfferRegistryClock(),
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		t.Fatalf("NewOfferRegistry() error = %v", err)
	}
	return offers
}

func performRequest(handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func decodeResponse(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.Unmarshal(response.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, response.Body.String())
	}
}
