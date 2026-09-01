package signaling

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
)

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
