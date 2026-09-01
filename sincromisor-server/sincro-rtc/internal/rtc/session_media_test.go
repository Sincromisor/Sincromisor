package rtc

import (
	"io"
	"runtime"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

func TestManagerInboundEOFClosesSessionAndRemovesRegistryEntry(t *testing.T) {
	manager := newTestManager(t)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client := newBrowserPeer(t)
	t.Cleanup(func() { _ = client.Close() })
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
	session := activeSession(t, manager, answer.SessionID)
	if err := inputTrack.WriteSample(media.Sample{
		Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond,
	}); err != nil {
		t.Fatalf("WriteSample(input) error = %v", err)
	}
	waitForCondition(t, 3*time.Second, func() bool {
		session.lifecycle.mu.Lock()
		defer session.lifecycle.mu.Unlock()
		return session.lifecycle.audio != nil
	})
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
	waitForRemoteSessionClose(t, manager, answer.SessionID, session)
}

func TestInboundEOFClosesSessionNormally(t *testing.T) {
	manager, session := newManagedLifecycleSession(t, SystemClock{}, blockingPipelineFactory{})
	session.wg.Add(1)
	session.startInbound(&singlePacketReader{})
	waitSessionDone(t, session)
	if session.lifecycle.closeReason != "normal" {
		t.Fatalf("close reason = %q, want normal", session.lifecycle.closeReason)
	}
	if manager.Count() != 0 {
		t.Fatalf("registry Count() = %d, want 0", manager.Count())
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
		client := newBrowserPeer(t)
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
		testSynthDecoder(t),
		testInputObserver(),
		SystemClock{},
		testLogger(),
		func(sessionID string) { closed <- sessionID },
		nil,
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
