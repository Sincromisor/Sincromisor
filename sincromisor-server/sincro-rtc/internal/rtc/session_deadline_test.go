package rtc

import (
	"testing"
)

func TestSessionPreConnectDeadlineClosesWithoutPipeline(t *testing.T) {
	clock := &fakeClock{}
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 1)}
	manager, session := newManagedLifecycleSession(t, clock, factory)

	if err := session.answerReady(); err != nil {
		t.Fatalf("answerReady() error = %v", err)
	}
	if got := clock.duration(0); got != preConnectTimeout {
		t.Fatalf("pre-connect duration = %v, want %v", got, preConnectTimeout)
	}
	clock.timer(0).fire()
	waitSessionDone(t, session)
	assertClosedSession(t, manager, session, "pre_connect_timeout")
	assertNoPipelineCall(t, factory)
}

func TestSessionMediaReadinessDeadlineClosesWithoutPipeline(t *testing.T) {
	clock := &fakeClock{}
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 1)}
	manager, session := newManagedLifecycleSession(t, clock, factory)

	if err := session.answerReady(); err != nil {
		t.Fatalf("answerReady() error = %v", err)
	}
	session.transportReady()
	if got := clock.duration(1); got != mediaReadinessTimeout {
		t.Fatalf("media-readiness duration = %v, want %v", got, mediaReadinessTimeout)
	}
	clock.timer(1).fire()
	waitSessionDone(t, session)
	assertClosedSession(t, manager, session, "media_readiness_timeout")
	assertNoPipelineCall(t, factory)
}

func assertClosedSession(t *testing.T, manager *Manager, session *Session, reason string) {
	t.Helper()
	session.lifecycle.mu.Lock()
	state, closeReason := session.lifecycle.state, session.lifecycle.closeReason
	session.lifecycle.mu.Unlock()
	if state != stateClosed || closeReason != reason {
		t.Fatalf("state/reason = %s/%s, want closed/%s", state, closeReason, reason)
	}
	if manager.Count() != 0 {
		t.Fatalf("registry Count() = %d, want 0 after joined cleanup", manager.Count())
	}
}

func assertNoPipelineCall(t *testing.T, factory *recordingBlockingFactory) {
	t.Helper()
	select {
	case call := <-factory.calls:
		t.Fatalf("unexpected pipeline call: %+v", call)
	default:
	}
}
