package rtc

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSessionCloseIsNonBlockingAndPublishesAfterAllJoins(t *testing.T) {
	peer := newCloseProbe(true)
	codec := newCloseProbe(true)
	pipeline := newCloseProbe(true)
	manager, session := newCleanupProbeSession(t, peer, codec, pipeline)
	joinRelease := make(chan struct{})
	session.wg.Add(1)
	go func() {
		defer session.wg.Done()
		<-joinRelease
	}()

	returned := make(chan error, 1)
	go func() { returned <- session.Close("probe_close") }()
	select {
	case err := <-returned:
		if err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Close blocked on resource cleanup")
	}
	peer.waitStarted(t)
	codec.waitStarted(t)
	pipeline.waitStarted(t)

	var callers sync.WaitGroup
	for range 100 {
		callers.Add(1)
		go func() {
			defer callers.Done()
			if err := session.Close("duplicate_close"); err != nil {
				t.Errorf("duplicate Close() error = %v", err)
			}
		}()
	}
	callers.Wait()
	assertCleanupPending(t, manager, session)

	peer.unblock()
	codec.unblock()
	pipeline.unblock()
	assertCleanupPending(t, manager, session)
	close(joinRelease)
	waitSessionDone(t, session)
	assertClosedSession(t, manager, session, "probe_close")
	for name, probe := range map[string]*closeProbe{
		"peer": peer, "codec": codec, "pipeline": pipeline,
	} {
		if got := probe.calls.Load(); got != 1 {
			t.Fatalf("%s close calls = %d, want 1", name, got)
		}
	}
}

func TestManagerCloseAllDeadlineKeepsCleanupRunning(t *testing.T) {
	peer := newCloseProbe(true)
	manager, session := newCleanupProbeSession(
		t,
		peer,
		newCloseProbe(false),
		newCloseProbe(false),
	)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	err := manager.CloseAll(ctx, "deadline_shutdown")
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("CloseAll() error = %v, want deadline exceeded", err)
	}
	assertCleanupPending(t, manager, session)

	peer.unblock()
	waitSessionDone(t, session)
	assertClosedSession(t, manager, session, "deadline_shutdown")
}

func TestManagerCloseAllNormalResourcesConvergeWithinFiveSeconds(t *testing.T) {
	manager, session := newCleanupProbeSession(
		t,
		newCloseProbe(false),
		newCloseProbe(false),
		newCloseProbe(false),
	)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := manager.CloseAll(ctx, "normal_shutdown"); err != nil {
		t.Fatalf("CloseAll() error = %v", err)
	}
	assertClosedSession(t, manager, session, "normal_shutdown")
}

func newCleanupProbeSession(
	t *testing.T,
	peer *closeProbe,
	codec *closeProbe,
	pipeline *closeProbe,
) (*Manager, *Session) {
	t.Helper()
	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: blockingPipelineFactory{},
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	lifecycle, err := newSessionLifecycle(SystemClock{})
	if err != nil {
		t.Fatalf("newSessionLifecycle() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	session := &Session{
		id: "cleanup-probe", lifecycle: lifecycle, ctx: ctx, cancel: cancel,
		done: make(chan struct{}), logger: testLogger(), onClosed: manager.remove,
		closers: sessionResourceClosers{
			peer: peer.Close, codec: codec.Close, pipeline: pipeline.Close,
		},
	}
	manager.sessions[session.id] = session
	return manager, session
}

func assertCleanupPending(t *testing.T, manager *Manager, session *Session) {
	t.Helper()
	assertSessionState(t, session, stateClosing)
	select {
	case <-session.done:
		t.Fatal("done closed before all resource joins")
	default:
	}
	if manager.Count() != 1 {
		t.Fatalf("registry Count() = %d, want 1 while cleanup is pending", manager.Count())
	}
}

type closeProbe struct {
	calls   atomic.Int32
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func newCloseProbe(block bool) *closeProbe {
	probe := &closeProbe{started: make(chan struct{})}
	if block {
		probe.release = make(chan struct{})
	}
	return probe
}

func (p *closeProbe) Close() error {
	p.calls.Add(1)
	p.once.Do(func() { close(p.started) })
	if p.release != nil {
		<-p.release
	}
	return nil
}

func (p *closeProbe) waitStarted(t *testing.T) {
	t.Helper()
	select {
	case <-p.started:
	case <-time.After(time.Second):
		t.Fatal("resource Close did not start")
	}
}

func (p *closeProbe) unblock() {
	if p.release != nil {
		close(p.release)
	}
}
