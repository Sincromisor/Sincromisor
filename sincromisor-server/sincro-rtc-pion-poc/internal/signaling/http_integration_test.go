package signaling

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

func TestRealManagerRejectsMalformedSDPAndRemovesSession(t *testing.T) {
	manager := newRealTestManager(t, "")
	server := New(
		manager,
		newTestOfferRegistry(t, manager, time.Second),
		t.TempDir(),
		"",
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	response := performRequest(
		server.Handler(),
		http.MethodPost,
		offerPath,
		`{"sdp":"not-an-sdp","type":"offer","talk_mode":"chat","offer_request_id":"89d1558a-d077-4620-9037-ca5bc608d42a","offer_revision":1}`,
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", response.Code, response.Body.String())
	}
	waitForRegistryCount(t, manager, 0)
}

func TestRealManagerRejectsMalformedNonNullCandidate(t *testing.T) {
	manager := newRealTestManager(t, "")
	t.Cleanup(func() {
		if err := manager.CloseAll(closeContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	server := New(
		manager,
		newTestOfferRegistry(t, manager, time.Second),
		t.TempDir(),
		"",
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	sessionID := createRealManagerSession(t, server)
	body := `{"session_id":` + quoteJSON(t, sessionID) +
		`,"candidate":{"candidate":"not-a-candidate","sdpMid":"0","sdpMLineIndex":0}}`
	response := performRequest(server.Handler(), http.MethodPost, candidatePath, body)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", response.Code, response.Body.String())
	}
	if manager.Count() != 1 {
		t.Fatalf("malformed candidate changed active registry count = %d, want 1", manager.Count())
	}
	if err := manager.CloseAll(closeContext(t), "test_teardown"); err != nil {
		t.Fatalf("CloseAll(test_teardown) error = %v", err)
	}
	if manager.Count() != 0 {
		t.Fatalf("registry count after teardown = %d, want 0", manager.Count())
	}
}

func TestRealManagerGatherTimeoutReturns504AndRemovesSession(t *testing.T) {
	manager := newRealTestManager(t, "stun:127.0.0.1:9")
	server := New(
		manager,
		newTestOfferRegistry(t, manager, 5*time.Millisecond),
		t.TempDir(),
		"stun:127.0.0.1:9",
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	offer := newRealBrowserOffer(t)
	response := performRequest(
		server.Handler(),
		http.MethodPost,
		offerPath,
		`{"sdp":`+quoteJSON(t, offer)+`,"type":"offer","talk_mode":"chat","offer_request_id":"3b346d93-c8f1-4368-b788-735f64c18b8a","offer_revision":1}`,
	)
	if response.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want 504; body=%s", response.Code, response.Body.String())
	}
	waitForRegistryCount(t, manager, 0)
}

func newRealTestManager(t *testing.T, stunURL string) *rtc.Manager {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	manager, err := rtc.NewManager(stunURL, rtc.ManagerConfig{
		PipelineFactory: signalingBlockingFactory{},
		InputObserver:   audiomedia.NewInputCounterObserver(),
		Clock:           rtc.SystemClock{},
		Logger:          logger,
		MaxSessions:     100,
	})
	if err != nil {
		t.Fatalf("rtc.NewManager() error = %v", err)
	}
	return manager
}

func closeContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}

type signalingBlockingFactory struct{}

func (signalingBlockingFactory) Connect(
	ctx context.Context,
	_, _ string,
) (pipeline.ClientSet, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func createRealManagerSession(t *testing.T, server *Server) string {
	t.Helper()
	offer := newRealBrowserOffer(t)
	response := performRequest(
		server.Handler(),
		http.MethodPost,
		offerPath,
		`{"sdp":`+quoteJSON(t, offer)+`,"type":"offer","talk_mode":"chat","offer_request_id":"6445fb00-a22a-471d-ae4e-89d4509cf0e3","offer_revision":1}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", response.Code, response.Body.String())
	}
	var answer rtc.Answer
	decodeResponse(t, response, &answer)
	return answer.SessionID
}

func newRealBrowserOffer(t *testing.T) string {
	t.Helper()
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection() error = %v", err)
	}
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("client.Close() error = %v", err)
		}
	})
	if _, err := client.AddTransceiverFromKind(
		webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		t.Fatalf("AddTransceiverFromKind() error = %v", err)
	}
	offer, err := client.CreateOffer(nil)
	if err != nil {
		t.Fatalf("CreateOffer() error = %v", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(offer); err != nil {
		t.Fatalf("SetLocalDescription() error = %v", err)
	}
	<-gatherComplete
	local := client.LocalDescription()
	if local == nil {
		t.Fatal("client local description is nil")
	}
	return local.SDP
}

func quoteJSON(t *testing.T, value string) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal JSON string: %v", err)
	}
	return string(encoded)
}

func waitForRegistryCount(t *testing.T, manager *rtc.Manager, want int) {
	t.Helper()
	timer := time.NewTimer(3 * time.Second)
	defer timer.Stop()
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		if manager.Count() == want {
			return
		}
		select {
		case <-timer.C:
			t.Fatalf("registry count = %d, want %d", manager.Count(), want)
		case <-ticker.C:
		}
	}
}
