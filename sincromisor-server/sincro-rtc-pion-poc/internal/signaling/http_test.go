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
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

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
			body: `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat"}`,
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
			body:       `{"sdp":"invalid","type":"offer","talk_mode":"chat"}`,
			fake:       &fakeSessions{createErr: errors.New("set remote offer")},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "update offer",
			body:       `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat","session_id":"old"}`,
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
	server := New(fake, t.TempDir(), "", time.Millisecond, slog.New(slog.NewTextHandler(io.Discard, nil)))
	response := performRequest(
		server.Handler(),
		http.MethodPost,
		offerPath,
		`{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat"}`,
	)
	if response.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want 504; body=%s", response.Code, response.Body.String())
	}
	if !fake.createCanceled {
		t.Fatal("Create did not observe gathering context cancellation")
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
	server := New(&fakeSessions{}, frontendDir, "", time.Second, slog.New(slog.NewTextHandler(io.Discard, nil)))
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
	candidateApplied bool
	candidateReason  string
	candidateErr     error
}

func (f *fakeSessions) Create(ctx context.Context, _ rtc.Offer) (rtc.Answer, error) {
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
	return New(
		sessions,
		t.TempDir(),
		stunURL,
		time.Second,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
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
