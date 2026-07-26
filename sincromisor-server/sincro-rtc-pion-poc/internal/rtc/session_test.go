package rtc

import (
	"context"
	"io"
	"log/slog"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

func TestManagerConnectionDataChannelsAndClose(t *testing.T) {
	manager := NewManager("", slog.New(slog.NewTextHandler(io.Discard, nil)))
	client, messages := newBrowserPeer(t)
	answer := negotiatePair(t, manager, client)
	if manager.Count() != 1 {
		t.Fatalf("Count() = %d, want 1 after offer", manager.Count())
	}
	if answer.SessionID == "" {
		t.Fatal("Create() returned empty session ID")
	}
	applied, reason, err := manager.AddCandidate(answer.SessionID, nil)
	if err != nil || !applied || reason != "" {
		t.Fatalf("AddCandidate(end-of-candidates) = (%v, %q, %v), want true", applied, reason, err)
	}

	waitForMessages(t, messages, map[string]string{
		textChannelLabel:  string(textSmokePayload),
		telopChannelLabel: string(telopSmokePayload),
	})
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
	if err := manager.CloseAll("browser_normal_close"); err != nil {
		t.Fatalf("CloseAll() error = %v", err)
	}
	if manager.Count() != 0 {
		t.Fatalf("Count() = %d, want 0 after close", manager.Count())
	}
	applied, reason, err = manager.AddCandidate(answer.SessionID, nil)
	if err != nil {
		t.Fatalf("AddCandidate(closed) error = %v", err)
	}
	if applied || reason != "session_closed" {
		t.Fatalf("closed candidate = (%v, %q), want false, session_closed", applied, reason)
	}
}

func TestManagerTenSequentialNormalClosesConverge(t *testing.T) {
	baseline := runtime.NumGoroutine()
	manager := NewManager("", slog.New(slog.NewTextHandler(io.Discard, nil)))
	for attempt := 1; attempt <= 10; attempt++ {
		client, _ := newBrowserPeer(t)
		_ = negotiatePair(t, manager, client)
		if err := client.Close(); err != nil {
			t.Fatalf("attempt %d client.Close() error = %v", attempt, err)
		}
		if err := manager.CloseAll("browser_normal_close"); err != nil {
			t.Fatalf("attempt %d CloseAll() error = %v", attempt, err)
		}
		if manager.Count() != 0 {
			t.Fatalf("attempt %d Count() = %d, want 0", attempt, manager.Count())
		}
	}
	waitForCondition(t, 3*time.Second, func() bool {
		return runtime.NumGoroutine() <= baseline+5
	})
}

func TestSessionCloseIsIdempotent(t *testing.T) {
	manager := NewManager("", slog.New(slog.NewTextHandler(io.Discard, nil)))
	client, _ := newBrowserPeer(t)
	answer := negotiatePair(t, manager, client)

	manager.mu.RLock()
	session := manager.sessions[answer.SessionID]
	manager.mu.RUnlock()
	if session == nil {
		t.Fatal("session missing after negotiation")
	}
	var wait sync.WaitGroup
	for range 8 {
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

func TestManagerGracefulShutdownWithoutConnectedPeer(t *testing.T) {
	manager := NewManager("", slog.New(slog.NewTextHandler(io.Discard, nil)))
	client, _ := newBrowserPeer(t)
	_ = negotiatePair(t, manager, client)
	if err := manager.CloseAll("sigterm"); err != nil {
		t.Fatalf("CloseAll(sigterm) error = %v", err)
	}
	if manager.Count() != 0 {
		t.Fatalf("Count() = %d, want 0", manager.Count())
	}
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
}

func TestCodecErrorClosesSession(t *testing.T) {
	closed := make(chan string, 1)
	session, err := newSession(
		"codec-error-session",
		webrtc.Configuration{},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		func(sessionID string) { closed <- sessionID },
	)
	if err != nil {
		t.Fatalf("newSession() error = %v", err)
	}
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	answer, err := manager.Create(ctx, Offer{SDP: local.SDP, Type: "offer", TalkMode: "chat"})
	if err != nil {
		t.Fatalf("Manager.Create() error = %v", err)
	}
	if err := client.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  answer.SDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription() error = %v", err)
	}
	waitForCondition(t, 5*time.Second, func() bool {
		return client.ConnectionState() == webrtc.PeerConnectionStateConnected
	})
	return answer
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
