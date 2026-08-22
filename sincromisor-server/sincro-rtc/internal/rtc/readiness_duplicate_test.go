package rtc

import (
	"testing"

	"github.com/pion/webrtc/v4"
)

func TestAudioTrackDuplicateObjectPolicy(t *testing.T) {
	clock := &fakeClock{}
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 1)}
	manager, session := newManagedLifecycleSession(t, clock, factory)
	first := &webrtc.TrackRemote{}
	if !session.acceptAudioTrack(first) {
		t.Fatal("first audio track was not accepted")
	}
	session.wg.Done()
	if session.acceptAudioTrack(first) {
		t.Fatal("same audio object was accepted twice")
	}
	assertSessionState(t, session, stateCreated)

	if session.acceptAudioTrack(&webrtc.TrackRemote{}) {
		t.Fatal("second audio object was accepted")
	}
	waitSessionDone(t, session)
	assertClosedSession(t, manager, session, "duplicate_media")
	assertNoPipelineCall(t, factory)
}

func TestDataChannelDuplicateObjectPolicy(t *testing.T) {
	for _, label := range []string{textChannelLabel, telopChannelLabel} {
		t.Run(label, func(t *testing.T) {
			clock := &fakeClock{}
			factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 1)}
			manager, session := newManagedLifecycleSession(t, clock, factory)
			first := newSessionDataChannel(t, session, label)
			if !session.registerDataChannel(first) {
				t.Fatal("first channel object was not registered")
			}
			if session.registerDataChannel(first) {
				t.Fatal("same channel object was registered twice")
			}
			if !session.dataChannelOpened(first) {
				t.Fatal("first open callback was not accepted")
			}
			if session.dataChannelOpened(first) {
				t.Fatal("same open state was accepted twice")
			}
			assertSessionState(t, session, stateCreated)

			second := newSessionDataChannel(t, session, label)
			if session.registerDataChannel(second) {
				t.Fatal("second channel object was registered")
			}
			waitSessionDone(t, session)
			assertClosedSession(t, manager, session, "duplicate_media")
			assertNoPipelineCall(t, factory)
		})
	}
}

func assertSessionState(t *testing.T, session *Session, want sessionState) {
	t.Helper()
	session.lifecycle.mu.Lock()
	got := session.lifecycle.state
	session.lifecycle.mu.Unlock()
	if got != want {
		t.Fatalf("session state = %s, want %s", got, want)
	}
}
