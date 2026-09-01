package rtc

import (
	"context"
	"io"
	"log/slog"
	"net"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

const rtcTestOfferRequestID = "8e0e18a9-243b-4c72-8e97-a1b103854e42"

func newManagedLifecycleSession(
	t *testing.T,
	clock Clock,
	factory pipeline.ClientSetFactory,
) (*Manager, *Session) {
	t.Helper()
	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: factory,
		InputObserver:   testInputObserver(),
		Clock:           clock,
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	coordinator, err := pipeline.NewCoordinator(factory, testLogger())
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	session, err := newSession(
		"lifecycle-session",
		"chat",
		webrtc.Configuration{},
		0,
		coordinator,
		testSynthDecoder(t),
		testInputObserver(),
		clock,
		testLogger(),
		manager.remove,
		nil,
	)
	if err != nil {
		t.Fatalf("newSession() error = %v", err)
	}
	manager.sessions[session.id] = session
	t.Cleanup(func() {
		_ = session.Close("test_teardown")
		<-session.done
	})
	return manager, session
}

func testSynthDecoder(t *testing.T) *synthdecode.Decoder {
	t.Helper()
	decoder, err := synthdecode.NewDecoder("/test/ffmpeg", rtcNoopRunner{})
	if err != nil {
		t.Fatalf("synthdecode.NewDecoder() error = %v", err)
	}
	return decoder
}

type rtcNoopRunner struct{}

func (rtcNoopRunner) Run(
	context.Context,
	string,
	[]byte,
	int64,
	int64,
	...string,
) ([]byte, []byte, int, error) {
	return nil, nil, 0, nil
}

func testInputObserver() inputmedia.Observer {
	return inputmedia.NewCounterObserver()
}

func newSessionDataChannel(t *testing.T, session *Session, label string) *webrtc.DataChannel {
	t.Helper()
	channel, err := session.pc.CreateDataChannel(label, nil)
	if err != nil {
		t.Fatalf("CreateDataChannel(%s) error = %v", label, err)
	}
	return channel
}

func waitSessionDone(t *testing.T, session *Session) {
	t.Helper()
	select {
	case <-session.done:
	case <-testCloseContext(t).Done():
		t.Fatalf("session %s cleanup did not complete", session.id)
	}
}
func newTestManager(t *testing.T) *Manager {
	t.Helper()
	return newTestManagerWithFactory(t, blockingPipelineFactory{})
}

func newTestManagerWithFactory(t *testing.T, factory pipeline.ClientSetFactory) *Manager {
	t.Helper()
	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: factory,
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	return manager
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func testCloseContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}

type blockingPipelineFactory struct{}

func (blockingPipelineFactory) Connect(
	ctx context.Context,
	_, _ string,
) (pipeline.ClientSet, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func newBrowserPeer(t *testing.T) *webrtc.PeerConnection {
	t.Helper()
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection() error = %v", err)
	}
	if _, err := client.AddTransceiverFromKind(
		webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		t.Fatalf("AddTransceiverFromKind() error = %v", err)
	}
	_, err = client.CreateDataChannel(textChannelLabel, &webrtc.DataChannelInit{Ordered: boolPointer(true)})
	if err != nil {
		t.Fatalf("CreateDataChannel(text) error = %v", err)
	}
	ordered := false
	retransmits := uint16(0)
	_, err = client.CreateDataChannel(telopChannelLabel, &webrtc.DataChannelInit{
		Ordered:        &ordered,
		MaxRetransmits: &retransmits,
	})
	if err != nil {
		t.Fatalf("CreateDataChannel(telop) error = %v", err)
	}
	client.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		go func() {
			for {
				if _, _, err := track.ReadRTP(); err != nil {
					return
				}
			}
		}()
	})
	return client
}

func negotiatePair(t *testing.T, manager *Manager, client *webrtc.PeerConnection) Answer {
	t.Helper()
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
	// 同一host内のtestでは、Docker/Tailscaleを含む全interfaceのcandidate pairを評価する必要がない。
	// 両peerに存在する先頭IPv4 host candidateへ絞り、到達不能IPv6 pairの探索量がrace detectorの
	// 5秒deadlineを左右しないようにする。productionのcandidate収集契約は変更しない。
	offerSDP, hostIP := singleHostCandidateSDP(t, local.SDP, "")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	answer, err := manager.Create(ctx, Offer{
		SDP: offerSDP, Type: "offer", TalkMode: "chat",
		OfferRequestID: rtcTestOfferRequestID,
	})
	if err != nil {
		t.Fatalf("Manager.Create() error = %v", err)
	}
	answerSDP, _ := singleHostCandidateSDP(t, answer.SDP, hostIP)
	if err := client.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  answerSDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription() error = %v", err)
	}
	waitForCondition(t, 5*time.Second, func() bool {
		return client.ConnectionState() == webrtc.PeerConnectionStateConnected
	})
	return answer
}

func singleHostCandidateSDP(t *testing.T, description, hostIP string) (string, string) {
	t.Helper()
	lines := strings.Split(description, "\n")
	if hostIP == "" {
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) >= 8 &&
				strings.HasPrefix(fields[0], "a=candidate:") &&
				fields[7] == "host" &&
				net.ParseIP(fields[4]).To4() != nil {
				hostIP = fields[4]
				break
			}
		}
	}
	if hostIP == "" {
		t.Fatal("SDP has no IPv4 host candidate for local peer test")
	}
	filtered := make([]string, 0, len(lines))
	kept := 0
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 5 && strings.HasPrefix(fields[0], "a=candidate:") {
			if fields[4] != hostIP {
				continue
			}
			kept++
		}
		filtered = append(filtered, line)
	}
	if kept == 0 {
		t.Fatalf("SDP has no host candidate for selected local address %s", hostIP)
	}
	return strings.Join(filtered, "\n"), hostIP
}
func waitForCondition(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		runtime.Gosched()
	}
	t.Fatal("condition did not become true before deadline")
}

func activeSession(t *testing.T, manager *Manager, sessionID string) *Session {
	t.Helper()
	manager.mu.RLock()
	session := manager.sessions[sessionID]
	manager.mu.RUnlock()
	if session == nil {
		t.Fatalf("session %q missing before client close", sessionID)
	}
	return session
}

func waitForRemoteSessionClose(t *testing.T, manager *Manager, sessionID string, session *Session) {
	t.Helper()
	select {
	case <-session.done:
	case <-time.After(3 * time.Second):
		t.Fatalf("session %q did not close from remote event", sessionID)
	}
	if manager.Count() != 0 {
		t.Fatalf("session %q done but registry count = %d, want 0", sessionID, manager.Count())
	}
}

func boolPointer(value bool) *bool {
	return &value
}
