package rtc

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

const rtcTestOfferRequestID = "8e0e18a9-243b-4c72-8e97-a1b103854e42"

func TestManagerConnectionDataChannelsAndClose(t *testing.T) {
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 1)}
	manager := newTestManagerWithFactory(t, factory)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client, messages := newBrowserPeer(t)
	answer := negotiatePair(t, manager, client)
	if manager.Count() != 1 {
		t.Fatalf("Count() = %d, want 1 after offer", manager.Count())
	}
	if manager.reservations != 0 {
		t.Fatalf("reservations = %d, want 0 after Session publication", manager.reservations)
	}
	if answer.SessionID == "" {
		t.Fatal("Create() returned empty session ID")
	}
	duplicate, err := manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if err != nil || duplicate {
		t.Fatalf("AddCandidate(end-of-candidates) = (%v, %v), want applied", duplicate, err)
	}
	duplicate, err = manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if err != nil || !duplicate {
		t.Fatalf("AddCandidate(duplicate end-of-candidates) = (%v, %v), want duplicate", duplicate, err)
	}

	waitForMessages(t, messages, map[string]string{
		textChannelLabel:  string(textSmokePayload),
		telopChannelLabel: string(telopSmokePayload),
	})
	session := activeSession(t, manager, answer.SessionID)
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
	waitForRemoteSessionClose(t, manager, answer.SessionID, session)
	if manager.Count() != 0 {
		t.Fatalf("Count() = %d, want 0 after close", manager.Count())
	}
	assertNoPipelineCall(t, factory)
	duplicate, err = manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if duplicate || !errors.Is(err, ErrSessionClosed) {
		t.Fatalf("closed candidate = (%v, %v), want ErrSessionClosed", duplicate, err)
	}
}

func TestManagerTenSequentialNormalClosesConverge(t *testing.T) {
	baseline := runtime.NumGoroutine()
	manager := newTestManager(t)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	for attempt := 1; attempt <= 10; attempt++ {
		client, _ := newBrowserPeer(t)
		answer := negotiatePair(t, manager, client)
		session := activeSession(t, manager, answer.SessionID)
		if err := client.Close(); err != nil {
			t.Fatalf("attempt %d client.Close() error = %v", attempt, err)
		}
		waitForRemoteSessionClose(t, manager, answer.SessionID, session)
		if manager.Count() != 0 {
			t.Fatalf("attempt %d Count() = %d, want 0", attempt, manager.Count())
		}
	}
	waitForCondition(t, 3*time.Second, func() bool {
		return runtime.NumGoroutine() <= baseline+5
	})
}

func TestManagerICERestartKeepsSessionPeerChannelsAndPipeline(t *testing.T) {
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
	manager := newTestManagerWithFactory(t, factory)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client, messages := newBrowserPeer(t)
	inputTrack, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2},
		"browser-audio",
		"browser",
	)
	if err != nil {
		t.Fatalf("NewTrackLocalStaticSample() error = %v", err)
	}
	if _, err := client.AddTrack(inputTrack); err != nil {
		t.Fatalf("AddTrack(input) error = %v", err)
	}
	answer := negotiatePair(t, manager, client)
	waitForMessages(t, messages, map[string]string{
		textChannelLabel: string(textSmokePayload), telopChannelLabel: string(telopSmokePayload),
	})
	if err := inputTrack.WriteSample(media.Sample{
		Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond,
	}); err != nil {
		t.Fatalf("WriteSample(initial) error = %v", err)
	}
	select {
	case call := <-factory.calls:
		if call.sessionID != answer.SessionID {
			t.Fatalf("pipeline session = %s, want %s", call.sessionID, answer.SessionID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("pipeline did not start before ICE restart")
	}
	session := activeSession(t, manager, answer.SessionID)
	peerBefore := session.pc
	textBefore := session.lifecycle.textChannel
	telopBefore := session.lifecycle.telopChannel
	if _, err := manager.Update(context.Background(), UpdateOffer{
		SDP: "not-an-sdp", Type: "offer", TalkMode: "chat",
		SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	}); err == nil {
		t.Fatal("Manager.Update() accepted malformed pre-apply SDP")
	}
	if session.revision.current != 1 || manager.Count() != 1 {
		t.Fatalf("pre-apply failure changed revision/session = %d/%d, want 1/1",
			session.revision.current, manager.Count())
	}

	restartOffer, err := client.CreateOffer(&webrtc.OfferOptions{ICERestart: true})
	if err != nil {
		t.Fatalf("CreateOffer(ICERestart) error = %v", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(restartOffer); err != nil {
		t.Fatalf("SetLocalDescription(restart) error = %v", err)
	}
	<-gatherComplete
	restartSDP, hostIP := singleHostCandidateSDP(t, client.LocalDescription().SDP, "")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	restartAnswer, err := manager.Update(ctx, UpdateOffer{
		SDP: restartSDP, Type: "offer", TalkMode: "chat",
		SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	})
	if err != nil {
		t.Fatalf("Manager.Update() error = %v", err)
	}
	answerSDP, _ := singleHostCandidateSDP(t, restartAnswer.SDP, hostIP)
	if err := client.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer, SDP: answerSDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription(restart) error = %v", err)
	}
	waitForCondition(t, 5*time.Second, func() bool {
		return client.ConnectionState() == webrtc.PeerConnectionStateConnected
	})
	if restartAnswer.SessionID != answer.SessionID || restartAnswer.Revision != 2 {
		t.Fatalf("restart identity = %s/%d, want %s/2",
			restartAnswer.SessionID, restartAnswer.Revision, answer.SessionID)
	}
	retry, err := manager.Update(ctx, UpdateOffer{
		SDP: restartSDP, Type: "offer", TalkMode: "chat",
		SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	})
	if err != nil || retry != restartAnswer {
		t.Fatalf("completed update retry = (%+v, %v), want cached %+v", retry, err, restartAnswer)
	}
	for _, conflict := range []UpdateOffer{
		{SDP: restartSDP + " ", Type: "offer", TalkMode: "chat", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2},
		{SDP: restartSDP, Type: "offer", TalkMode: "chat", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 1},
		{SDP: restartSDP, Type: "offer", TalkMode: "chat", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 4},
		{SDP: restartSDP, Type: "offer", TalkMode: "sincro", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 3},
	} {
		if _, err := manager.Update(ctx, conflict); !errors.Is(err, ErrOfferConflict) {
			t.Fatalf("Update(conflict revision=%d mode=%s) error = %v", conflict.Revision, conflict.TalkMode, err)
		}
	}
	if manager.Count() != 1 || activeSession(t, manager, answer.SessionID) != session ||
		session.pc != peerBefore || session.lifecycle.textChannel != textBefore ||
		session.lifecycle.telopChannel != telopBefore {
		t.Fatal("ICE restart replaced session, PeerConnection, or DataChannels")
	}
	if err := inputTrack.WriteSample(media.Sample{
		Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond,
	}); err != nil {
		t.Fatalf("WriteSample(after restart) error = %v", err)
	}
	select {
	case call := <-factory.calls:
		t.Fatalf("ICE restart created a second pipeline: %+v", call)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestSessionCloseIsIdempotent(t *testing.T) {
	manager := newTestManager(t)
	client, _ := newBrowserPeer(t)
	answer := negotiatePair(t, manager, client)

	manager.mu.RLock()
	session := manager.sessions[answer.SessionID]
	manager.mu.RUnlock()
	if session == nil {
		t.Fatal("session missing after negotiation")
	}
	var wait sync.WaitGroup
	for range 100 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if err := session.Close("concurrent_close"); err != nil {
				t.Errorf("Close() error = %v", err)
			}
		}()
	}
	wait.Wait()
	<-session.done
	if manager.Count() != 0 {
		t.Fatalf("Count() = %d, want 0", manager.Count())
	}
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
}

func TestCodecErrorClosesSession(t *testing.T) {
	closed := make(chan string, 1)
	coordinator, err := pipeline.NewCoordinator(blockingPipelineFactory{}, testLogger())
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	session, err := newSession(
		"codec-error-session",
		"chat",
		webrtc.Configuration{},
		0,
		coordinator,
		testInputObserver(),
		SystemClock{},
		testLogger(),
		func(sessionID string) { closed <- sessionID },
	)
	if err != nil {
		t.Fatalf("newSession() error = %v", err)
	}
	session.wg.Add(1)
	session.startInbound(&singlePacketReader{packet: &rtp.Packet{Payload: []byte{0xff}}})
	select {
	case sessionID := <-closed:
		if sessionID != "codec-error-session" {
			t.Fatalf("closed session = %q, want codec-error-session", sessionID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("codec error did not close session")
	}
}

func TestInputObserverPanicClosesAndJoinsSession(t *testing.T) {
	closed := make(chan string, 1)
	coordinator, err := pipeline.NewCoordinator(blockingPipelineFactory{}, testLogger())
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	session, err := newSession(
		"observer-panic-session",
		"chat",
		webrtc.Configuration{},
		0,
		coordinator,
		panicRTCInputObserver{},
		SystemClock{},
		testLogger(),
		func(sessionID string) { closed <- sessionID },
	)
	if err != nil {
		t.Fatalf("newSession() error = %v", err)
	}
	session.wg.Add(1)
	session.startInbound(&singlePacketReader{packet: &rtp.Packet{
		Header: rtp.Header{SSRC: 1},
	}})
	select {
	case sessionID := <-closed:
		if sessionID != "observer-panic-session" {
			t.Fatalf("closed session = %q, want observer-panic-session", sessionID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("observer panic did not close and join session")
	}
	<-session.done
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

type panicRTCInputObserver struct{}

func (panicRTCInputObserver) ObserveInputEvent(audiomedia.InputEvent) {
	panic("observer failed")
}

func (blockingPipelineFactory) Connect(
	ctx context.Context,
	_, _ string,
) (pipeline.ClientSet, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func newBrowserPeer(t *testing.T) (*webrtc.PeerConnection, <-chan channelMessage) {
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
	messages := make(chan channelMessage, 2)
	text, err := client.CreateDataChannel(textChannelLabel, &webrtc.DataChannelInit{Ordered: boolPointer(true)})
	if err != nil {
		t.Fatalf("CreateDataChannel(text) error = %v", err)
	}
	ordered := false
	retransmits := uint16(0)
	telop, err := client.CreateDataChannel(telopChannelLabel, &webrtc.DataChannelInit{
		Ordered:        &ordered,
		MaxRetransmits: &retransmits,
	})
	if err != nil {
		t.Fatalf("CreateDataChannel(telop) error = %v", err)
	}
	for _, channel := range []*webrtc.DataChannel{text, telop} {
		channel := channel
		channel.OnMessage(func(message webrtc.DataChannelMessage) {
			messages <- channelMessage{label: channel.Label(), payload: string(message.Data)}
		})
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
	return client, messages
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

type channelMessage struct {
	label   string
	payload string
}

func waitForMessages(t *testing.T, messages <-chan channelMessage, want map[string]string) {
	t.Helper()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for len(want) != 0 {
		select {
		case message := <-messages:
			wantPayload, ok := want[message.label]
			if !ok {
				t.Fatalf("unexpected channel message: %+v", message)
			}
			if message.payload != wantPayload {
				t.Fatalf("%s payload = %q, want %q", message.label, message.payload, wantPayload)
			}
			delete(want, message.label)
		case <-timer.C:
			t.Fatalf("timed out waiting for channel messages: %v", want)
		}
	}
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

type singlePacketReader struct {
	packet *rtp.Packet
}

func (r *singlePacketReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	if r.packet == nil {
		return nil, nil, io.EOF
	}
	packet := r.packet
	r.packet = nil
	return packet, nil, nil
}
