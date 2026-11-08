package rtc

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

func TestEchoExpiredContext(t *testing.T) {
	m := newTestManager(t)
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	_, err := m.Create(ctx, Offer{SDP: "v=0\r\n", Type: "offer", TalkMode: "echo", OfferRequestID: rtcTestOfferRequestID})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v; want deadline exceeded", err)
	}
}

func TestEchoBuildFailure(t *testing.T) {
	m := newTestManager(t)
	buildErr := errors.New("build failed")
	m.buildSession = func(sessionBuildRequest) (*Session, error) { return nil, buildErr }
	_, err := m.Create(context.Background(), Offer{SDP: "v=0\r\n", Type: "offer", TalkMode: "echo", OfferRequestID: rtcTestOfferRequestID})
	if !errors.Is(err, buildErr) {
		t.Fatalf("got %v; want build error", err)
	}
}

func TestDataChannelRejectsNonemptyProtocol(t *testing.T) {
	_, s := newManagedLifecycleSession(t, SystemClock{}, blockingPipelineFactory{})
	protocol := "unexpected-protocol"
	channel, err := s.pc.CreateDataChannel(textChannelLabel, &webrtc.DataChannelInit{Protocol: &protocol})
	if err != nil {
		t.Fatal(err)
	}
	s.handleDataChannel(channel)
	s.lifecycle.mu.Lock()
	terminal := s.lifecycle.terminalLocked()
	s.lifecycle.mu.Unlock()
	if !terminal {
		t.Fatal("non-empty DataChannel protocol accepted")
	}
}
