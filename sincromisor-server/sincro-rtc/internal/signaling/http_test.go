package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
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
	if request.OfferRequestID == nil || request.OfferRevision == nil ||
		!validUUID(*request.OfferRequestID) || *request.OfferRevision != 1 {
		t.Fatalf("request fixture identity = %v/%v", request.OfferRequestID, request.OfferRevision)
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

func TestRevisionContractFixtures(t *testing.T) {
	requestBytes, err := os.ReadFile("testdata/update_offer_request.json")
	if err != nil {
		t.Fatalf("read update request fixture: %v", err)
	}
	var request offerRequest
	if err := json.Unmarshal(requestBytes, &request); err != nil {
		t.Fatalf("decode update request fixture: %v", err)
	}
	var sessionID string
	if err := json.Unmarshal(request.SessionID, &sessionID); err != nil {
		t.Fatalf("decode update session fixture: %v", err)
	}
	if request.OfferRequestID == nil || request.OfferRevision == nil {
		t.Fatalf("update request identity is missing")
	}
	if _, err := ulid.ParseStrict(sessionID); err != nil ||
		*request.OfferRevision != 2 || !validUUID(*request.OfferRequestID) {
		t.Fatalf("update request identity = %q/%v/%v", sessionID, request.OfferRevision, request.OfferRequestID)
	}

	answerBytes, err := os.ReadFile("testdata/update_offer_answer.json")
	if err != nil {
		t.Fatalf("read update answer fixture: %v", err)
	}
	var answer rtc.Answer
	if err := json.Unmarshal(answerBytes, &answer); err != nil {
		t.Fatalf("decode update answer fixture: %v", err)
	}
	if answer.SessionID != sessionID || answer.Revision != *request.OfferRevision {
		t.Fatalf("answer identity = %s/%d, want %s/%d",
			answer.SessionID, answer.Revision, sessionID, *request.OfferRevision)
	}
}

func TestCandidateContractFixturesPreservePresence(t *testing.T) {
	fixtureBytes, err := os.ReadFile("testdata/candidate_requests.json")
	if err != nil {
		t.Fatalf("read candidate fixture: %v", err)
	}
	var fixtures []struct {
		Name    string          `json:"name"`
		Request json.RawMessage `json:"request"`
	}
	if err := json.Unmarshal(fixtureBytes, &fixtures); err != nil {
		t.Fatalf("decode candidate fixtures: %v", err)
	}
	if len(fixtures) != 3 {
		t.Fatalf("candidate fixture count = %d, want 3", len(fixtures))
	}
	hashes := make([]string, 0, 2)
	for _, fixture := range fixtures {
		fake := &fakeSessions{candidateApplied: true}
		response := performRequest(
			newTestServer(t, fake, "").Handler(),
			http.MethodPost,
			candidatePath,
			string(fixture.Request),
		)
		if response.Code != http.StatusOK {
			t.Fatalf("%s status = %d; body=%s", fixture.Name, response.Code, response.Body.String())
		}
		if fixture.Name == "end of candidates" {
			if fake.lastCandidate != nil {
				t.Fatal("explicit null candidate did not remain end-of-candidates")
			}
			continue
		}
		if fake.lastCandidate == nil {
			t.Fatalf("%s decoded as end-of-candidates", fixture.Name)
		}
		hashes = append(hashes, fmt.Sprintf("%v", fake.lastCandidate))
	}
	if hashes[0] != hashes[1] {
		t.Fatalf("optional missing/null decoded differently: %q != %q", hashes[0], hashes[1])
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
			name: "legacy initial offer generates identity",
			body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat"}`,
			fake: &fakeSessions{answer: rtc.Answer{
				SDP: "v=0\r\n", Type: "answer", SessionID: "01TEST", Revision: 1,
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
			body:       `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","session_id":"01K1AF2Y0H0000000000000000","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":2}`,
			fake:       &fakeSessions{updateAnswer: rtc.Answer{SDP: "v=0\r\n", Type: "answer", SessionID: "01K1AF2Y0H0000000000000000", Revision: 2}},
			wantStatus: http.StatusOK,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := newTestServer(t, test.fake, "")
			response := performRequest(server.Handler(), http.MethodPost, offerPath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, test.wantStatus, response.Body.String())
			}
			if test.name == "legacy initial offer generates identity" && !validUUID(test.fake.lastOffer.OfferRequestID) {
				t.Fatalf("legacy offer request ID = %q, want UUID", test.fake.lastOffer.OfferRequestID)
			}
			if test.name == "legacy initial offer generates identity" {
				var answer rtc.Answer
				decodeResponse(t, response, &answer)
				if answer.SessionID != "01TEST" || answer.Revision != 1 {
					t.Fatalf("legacy answer identity = %q/%d, want 01TEST/1", answer.SessionID, answer.Revision)
				}
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

func TestUpdateOfferSchemaAndStatusBoundaries(t *testing.T) {
	valid := `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","session_id":"01K1AF2Y0H0000000000000000","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":2}`
	tests := []struct {
		name       string
		body       string
		fake       *fakeSessions
		wantStatus int
	}{
		{name: "valid", body: valid, fake: &fakeSessions{updateAnswer: rtc.Answer{Revision: 2}}, wantStatus: http.StatusOK},
		{name: "missing talk mode", body: strings.Replace(valid, `"talk_mode":"chat",`, "", 1), fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
		{name: "invalid talk mode", body: strings.Replace(valid, `"chat"`, `"other"`, 1), fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
		{name: "saved talk mode mismatch", body: strings.Replace(valid, `"chat"`, `"sincro"`, 1), fake: &fakeSessions{updateErr: rtc.ErrOfferConflict}, wantStatus: http.StatusConflict},
		{name: "missing request id", body: strings.Replace(valid, `,"offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42"`, "", 1), fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
		{name: "different request id", body: valid, fake: &fakeSessions{updateErr: rtc.ErrOfferConflict}, wantStatus: http.StatusConflict},
		{name: "revision zero", body: strings.Replace(valid, `"offer_revision":2`, `"offer_revision":0`, 1), fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
		{name: "revision conflict", body: valid, fake: &fakeSessions{updateErr: rtc.ErrOfferConflict}, wantStatus: http.StatusConflict},
		{name: "unknown session", body: valid, fake: &fakeSessions{updateErr: rtc.ErrSessionUnknown}, wantStatus: http.StatusNotFound},
		{name: "closed session", body: valid, fake: &fakeSessions{updateErr: rtc.ErrSessionClosed}, wantStatus: http.StatusGone},
		{name: "gather timeout", body: valid, fake: &fakeSessions{updateErr: context.DeadlineExceeded}, wantStatus: http.StatusGatewayTimeout},
		{name: "previous session forbidden", body: strings.TrimSuffix(valid, "}") + `,"previous_session_id":"01K1AF2Y0H0000000000000001"}`, fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := performRequest(newTestServer(t, test.fake, "").Handler(), http.MethodPost, offerPath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, test.wantStatus, response.Body.String())
			}
		})
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
		{name: "missing revision", body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42"}`, wantStatus: http.StatusBadRequest},
		{name: "empty request id", body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"","offer_revision":1}`, wantStatus: http.StatusBadRequest},
		{name: "zero revision", body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","offer_request_id":"8e0e18a9-243b-4c72-8e97-a1b103854e42","offer_revision":0}`, wantStatus: http.StatusBadRequest},
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
	baseline := runtime.NumGoroutine()
	fake := &fakeSessions{createErr: rtc.ErrSessionCapacity}
	processCtx, cancelProcess := context.WithCancel(context.Background())
	offers, err := NewOfferRegistry(fake, OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  time.Second,
		Capacity:       1,
		TTL:            2 * time.Minute,
		Clock:          SystemOfferRegistryClock(),
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		cancelProcess()
		t.Fatalf("NewOfferRegistry() error = %v", err)
	}
	server := New(fake, offers, t.TempDir(), "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	response := performRequest(
		server.Handler(),
		http.MethodPost,
		offerPath,
		validOfferBody("v=0\r\n"),
	)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", response.Code)
	}
	cancelProcess()
	waitCtx, cancelWait := context.WithTimeout(context.Background(), time.Second)
	defer cancelWait()
	if err := offers.Wait(waitCtx); err != nil {
		t.Fatalf("OfferRegistry.Wait() error = %v", err)
	}
	offers.mu.Lock()
	entryCount := len(offers.entries)
	offers.mu.Unlock()
	if entryCount != 0 {
		t.Fatalf("session 429 retained %d registry entries, want 0", entryCount)
	}
	if active := fake.activeSessions.Load(); active != 0 {
		t.Fatalf("session 429 retained %d active sessions, want 0", active)
	}
	if reservations := fake.reservations.Load(); reservations != 0 {
		t.Fatalf("session 429 retained %d reservations, want 0", reservations)
	}
	if builds := fake.resourceBuildCalls.Load(); builds != 0 {
		t.Fatalf("session 429 crossed resource builder %d times, want 0", builds)
	}
	select {
	case <-offers.sweeperDone:
	default:
		t.Fatal("session 429 left OfferRegistry sweeper running after Wait")
	}
	waitForSignalingCondition(t, time.Second, func() bool {
		return runtime.NumGoroutine() <= baseline+1
	})
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
			body:       `{"session_id":"01K1AF2Y0H0000000000000000","offer_revision":1,"candidate":{"candidate":"candidate:1 1 udp 1 127.0.0.1 5000 typ host","sdpMid":"0","sdpMLineIndex":0}}`,
			fake:       &fakeSessions{candidateApplied: true},
			wantStatus: http.StatusOK,
			wantApply:  true,
		},
		{
			name:       "end of candidates",
			body:       `{"session_id":"01K1AF2Y0H0000000000000000","offer_revision":1,"candidate":null}`,
			fake:       &fakeSessions{candidateApplied: true},
			wantStatus: http.StatusOK,
			wantApply:  true,
		},
		{
			name:       "unknown session",
			body:       `{"session_id":"01K1AF2Y0H0000000000000001","offer_revision":1,"candidate":null}`,
			fake:       &fakeSessions{candidateErr: rtc.ErrSessionUnknown},
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "closed session",
			body:       `{"session_id":"01K1AF2Y0H0000000000000002","offer_revision":1,"candidate":null}`,
			fake:       &fakeSessions{candidateErr: rtc.ErrSessionClosed},
			wantStatus: http.StatusGone,
		},
		{
			name:       "malformed json",
			body:       `{"session_id":`,
			fake:       &fakeSessions{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "malformed candidate",
			body:       `{"session_id":"01K1AF2Y0H0000000000000000","offer_revision":1,"candidate":{"candidate":""}}`,
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

func TestCandidatePresenceSizeAndRevisionBoundaries(t *testing.T) {
	validPrefix := `{"session_id":"01K1AF2Y0H0000000000000000","offer_revision":1`
	tests := []struct {
		name       string
		body       string
		fake       *fakeSessions
		wantStatus int
	}{
		{name: "candidate missing", body: validPrefix + `}`, fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
		{name: "revision missing", body: `{"session_id":"01K1AF2Y0H0000000000000000","candidate":null}`, fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
		{name: "revision zero", body: `{"session_id":"01K1AF2Y0H0000000000000000","offer_revision":0,"candidate":null}`, fake: &fakeSessions{}, wantStatus: http.StatusBadRequest},
		{name: "revision old", body: validPrefix + `,"candidate":null}`, fake: &fakeSessions{candidateErr: rtc.ErrOfferConflict}, wantStatus: http.StatusConflict},
		{name: "candidate exact limit", body: validPrefix + `,"candidate":{"candidate":"` + strings.Repeat("c", maxCandidateBytes) + `"}}`, fake: &fakeSessions{candidateApplied: true}, wantStatus: http.StatusOK},
		{name: "candidate over limit", body: validPrefix + `,"candidate":{"candidate":"` + strings.Repeat("c", maxCandidateBytes+1) + `"}}`, fake: &fakeSessions{}, wantStatus: http.StatusRequestEntityTooLarge},
		{name: "candidate capacity", body: validPrefix + `,"candidate":null}`, fake: &fakeSessions{candidateErr: rtc.ErrCandidateLimit}, wantStatus: http.StatusTooManyRequests},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := performRequest(newTestServer(t, test.fake, "").Handler(), http.MethodPost, candidatePath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, test.wantStatus, response.Body.String())
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
) *OfferRegistry {
	t.Helper()
	processCtx, cancel := context.WithCancel(context.Background())
	offers, err := NewOfferRegistry(sessions, OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  gatherTimeout,
		Capacity:       1000,
		TTL:            2 * time.Minute,
		Clock:          SystemOfferRegistryClock(),
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		cancel()
		t.Fatalf("NewOfferRegistry() error = %v", err)
	}
	t.Cleanup(func() {
		cancel()
		waitCtx, cancelWait := context.WithTimeout(context.Background(), time.Second)
		defer cancelWait()
		if waitErr := offers.Wait(waitCtx); waitErr != nil {
			t.Errorf("OfferRegistry.Wait(test cleanup) error = %v", waitErr)
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

func decodeResponse(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.Unmarshal(response.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, response.Body.String())
	}
}
