package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/signaling/offer"
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

func TestInitialOfferRegistryStatusMapping(t *testing.T) {
	fake := &fakeSessions{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000006", Revision: 1,
	}}
	processCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	offers, err := offer.New(fake, offer.Config{
		ProcessContext: processCtx,
		GatherTimeout:  time.Second,
		Capacity:       1,
		TTL:            2 * time.Minute,
		Clock:          offer.SystemClock(),
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		t.Fatalf("offer.New() error = %v", err)
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
	offers, err := offer.New(fake, offer.Config{
		ProcessContext: processCtx,
		GatherTimeout:  time.Second,
		Capacity:       1,
		TTL:            2 * time.Minute,
		Clock:          offer.SystemClock(),
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		cancelProcess()
		t.Fatalf("offer.New() error = %v", err)
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
		t.Fatalf("Registry.Wait() error = %v", err)
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
