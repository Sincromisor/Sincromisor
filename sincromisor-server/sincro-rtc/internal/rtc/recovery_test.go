package rtc

import (
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/pion/webrtc/v4"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
)

func TestDisconnectedNaturalRecoveryCancelsGrace(t *testing.T) {
	clock := &fakeClock{}
	_, session := newManagedLifecycleSession(t, clock, blockingPipelineFactory{})
	session.lifecycle.state = stateRunning

	session.handleICEConnectionState(webrtc.ICEConnectionStateDisconnected)
	if got := clock.duration(0); got != disconnectGraceTimeout {
		t.Fatalf("grace duration = %v, want %v", got, disconnectGraceTimeout)
	}
	session.handleICEConnectionState(webrtc.ICEConnectionStateConnected)
	if !clock.timer(0).isStopped() {
		t.Fatal("natural recovery did not stop disconnect grace")
	}
	if session.lifecycle.recovery != recoveryNone {
		t.Fatalf("recovery phase = %s, want none", session.lifecycle.recovery)
	}
}

func TestRecoveryDeadlineDoesNotReplaceMediaReadinessDeadline(t *testing.T) {
	clock := &fakeClock{}
	_, session := newManagedLifecycleSession(t, clock, blockingPipelineFactory{})
	if err := session.answerReady(); err != nil {
		t.Fatalf("answerReady() error = %v", err)
	}
	session.transportReady()
	mediaTimer := clock.timer(1)

	session.handleICEConnectionState(webrtc.ICEConnectionStateDisconnected)
	if mediaTimer.isStopped() {
		t.Fatal("disconnect grace replaced media readiness deadline")
	}
	session.handleICEConnectionState(webrtc.ICEConnectionStateConnected)
	if mediaTimer.isStopped() {
		t.Fatal("natural ICE recovery canceled media readiness deadline")
	}
}

func TestDisconnectedGraceThenRestartDeadlineCloses(t *testing.T) {
	clock := &fakeClock{}
	manager, session := newManagedLifecycleSession(t, clock, blockingPipelineFactory{})
	session.lifecycle.state = stateRunning

	session.handleICEConnectionState(webrtc.ICEConnectionStateDisconnected)
	clock.timer(0).fire()
	if got := clock.duration(1); got != restartDeadlineTimeout {
		t.Fatalf("restart duration = %v, want %v", got, restartDeadlineTimeout)
	}
	clock.timer(1).fire()
	waitSessionDone(t, session)
	assertClosedSession(t, manager, session, "ice_restart_timeout")
}

func TestDisconnectGraceExpiryRecordsDedicatedDeadlineExactlyOnce(t *testing.T) {
	clock := &fakeClock{}
	_, session := newManagedLifecycleSession(t, clock, blockingPipelineFactory{})
	recorder := &recordingRTCRecorder{Recorder: observability.Discard()}
	session.recorder = recorder
	session.lifecycle.state = stateRunning

	session.handleICEConnectionState(webrtc.ICEConnectionStateDisconnected)
	clock.timer(0).fire()
	clock.timer(0).fire()

	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if recorder.deadlines["disconnect_grace"] != 1 || recorder.deadlines["restart"] != 0 {
		t.Fatalf(
			"deadline metrics = %v, want disconnect_grace=1 and restart=0 before restart expiry",
			recorder.deadlines,
		)
	}
}

func TestFailedDeadlineRequiresSuccessfulUpdateCancellation(t *testing.T) {
	clock := &fakeClock{}
	_, session := newManagedLifecycleSession(t, clock, blockingPipelineFactory{})
	session.lifecycle.state = stateRunning

	session.handleICEConnectionState(webrtc.ICEConnectionStateFailed)
	if got := clock.duration(0); got != restartDeadlineTimeout {
		t.Fatalf("restart duration = %v, want %v", got, restartDeadlineTimeout)
	}
	session.handleICEConnectionState(webrtc.ICEConnectionStateConnected)
	if clock.timer(0).isStopped() {
		t.Fatal("connected callback canceled restart deadline before update success")
	}
	session.revision = newRevisionState(
		uuid.MustParse(rtcTestOfferRequestID), "offer-1", Answer{Revision: 1},
	)
	if !session.commitUpdate(2, "offer-2", Answer{Revision: 2}) {
		t.Fatal("active update commit was rejected")
	}
	if !clock.timer(0).isStopped() || session.lifecycle.recovery != recoveryNone {
		t.Fatal("successful update did not cancel restart deadline")
	}
}

func TestRestartDeadlineAndCloseRaceConverges(t *testing.T) {
	for range 50 {
		clock := &fakeClock{}
		_, session := newManagedLifecycleSession(t, clock, blockingPipelineFactory{})
		session.lifecycle.state = stateRunning
		session.handleICEConnectionState(webrtc.ICEConnectionStateFailed)

		var wait sync.WaitGroup
		wait.Add(2)
		go func() {
			defer wait.Done()
			clock.timer(0).fire()
		}()
		go func() {
			defer wait.Done()
			_ = session.Close("concurrent_close")
		}()
		wait.Wait()
		waitSessionDone(t, session)
		if session.lifecycle.state != stateClosed {
			t.Fatalf("race state = %s, want closed", session.lifecycle.state)
		}
	}
}
