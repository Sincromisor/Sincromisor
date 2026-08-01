package rtc

import (
	"testing"

	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

func newManagedLifecycleSession(
	t *testing.T,
	clock Clock,
	factory pipeline.ClientSetFactory,
) (*Manager, *Session) {
	t.Helper()
	manager, err := NewManager("", ManagerDependencies{
		PipelineFactory: factory,
		InputObserver:   testInputObserver(),
		Clock:           clock,
		Logger:          testLogger(),
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
		testInputObserver(),
		clock,
		testLogger(),
		manager.remove,
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

func testInputObserver() audiomedia.InputObserver {
	return audiomedia.NewInputCounterObserver()
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
