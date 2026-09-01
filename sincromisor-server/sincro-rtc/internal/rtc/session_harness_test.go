package rtc

import (
	"context"
	"testing"

	"github.com/pion/webrtc/v4"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

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
