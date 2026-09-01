package signaling

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
)

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
