package signaling

import (
	"net/http"
	"strings"
	"testing"
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
