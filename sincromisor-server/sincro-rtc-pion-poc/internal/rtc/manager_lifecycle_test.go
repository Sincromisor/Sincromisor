package rtc

import (
	"context"
	"errors"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

func TestManagerCreateAdmissionNeverExceedsCapacity(t *testing.T) {
	baseline := runtime.NumGoroutine()
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
	started := make(chan struct{}, 100)
	release := make(chan struct{})
	setupErr := errors.New("injected session setup failure")
	var buildCalls atomic.Int32
	manager.buildSession = func(sessionBuildRequest) (*Session, error) {
		buildCalls.Add(1)
		started <- struct{}{}
		<-release
		return nil, setupErr
	}
	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, createErr := manager.Create(context.Background(), Offer{
				Type: "offer", SDP: "v=0\r\n", TalkMode: "chat", OfferRequestID: rtcTestOfferRequestID,
			}); !errors.Is(createErr, setupErr) {
				t.Errorf("Create() error = %v, want setup failure", createErr)
			}
		}()
	}
	for range 100 {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatalf("buildSession calls = %d, want 100", buildCalls.Load())
		}
	}
	manager.mu.RLock()
	activeAtPeak := len(manager.sessions)
	reservationsAtPeak := manager.reservations
	manager.mu.RUnlock()
	if activeAtPeak != 0 || reservationsAtPeak != 100 {
		t.Fatalf("admission peak active/reservations = %d/%d, want 0/100",
			activeAtPeak, reservationsAtPeak)
	}
	if _, err := manager.Create(context.Background(), Offer{
		Type: "offer", SDP: "v=0\r\n", TalkMode: "chat", OfferRequestID: rtcTestOfferRequestID,
	}); !errors.Is(err, ErrSessionCapacity) {
		t.Fatalf("101st Create() error = %v, want ErrSessionCapacity", err)
	}
	if got := buildCalls.Load(); got != 100 {
		t.Fatalf("buildSession calls = %d, want 100; capacity rejection crossed PC/codec boundary", got)
	}
	close(release)
	wg.Wait()
	if manager.reservations != 0 {
		t.Fatalf("reservations = %d, want 0", manager.reservations)
	}
	if manager.Count() != 0 {
		t.Fatalf("active sessions = %d, want 0 after setup failures", manager.Count())
	}
	waitForCondition(t, time.Second, func() bool {
		return runtime.NumGoroutine() <= baseline+2
	})
}

func TestManagerCreateFailureReleasesPublishedSessionAndReservation(t *testing.T) {
	manager := newTestManager(t)
	if _, err := manager.Create(context.Background(), Offer{
		Type: "offer", SDP: "not-an-sdp", TalkMode: "chat", OfferRequestID: rtcTestOfferRequestID,
	}); err == nil {
		t.Fatal("Create() error = nil, want malformed SDP failure")
	}
	waitForCondition(t, time.Second, func() bool {
		return manager.Count() == 0
	})
	manager.mu.RLock()
	reservations := manager.reservations
	manager.mu.RUnlock()
	if reservations != 0 {
		t.Fatalf("reservations = %d, want 0 after negotiation failure", reservations)
	}
}

func TestNewManagerRejectsNilDependencies(t *testing.T) {
	valid := ManagerConfig{
		PipelineFactory: blockingPipelineFactory{},
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	}
	tests := []struct {
		name string
		deps ManagerConfig
	}{
		{name: "pipeline factory", deps: ManagerConfig{
			InputObserver: valid.InputObserver, Clock: valid.Clock, Logger: valid.Logger, MaxSessions: 100, SynthDecoder: valid.SynthDecoder,
		}},
		{name: "input observer", deps: ManagerConfig{
			PipelineFactory: valid.PipelineFactory, Clock: valid.Clock, Logger: valid.Logger, MaxSessions: 100, SynthDecoder: valid.SynthDecoder,
		}},
		{name: "clock", deps: ManagerConfig{
			PipelineFactory: valid.PipelineFactory, InputObserver: valid.InputObserver, Logger: valid.Logger, MaxSessions: 100, SynthDecoder: valid.SynthDecoder,
		}},
		{name: "logger", deps: ManagerConfig{
			PipelineFactory: valid.PipelineFactory, InputObserver: valid.InputObserver, Clock: valid.Clock, MaxSessions: 100, SynthDecoder: valid.SynthDecoder,
		}},
		{name: "synth decoder", deps: ManagerConfig{
			PipelineFactory: valid.PipelineFactory, InputObserver: valid.InputObserver, Clock: valid.Clock, Logger: valid.Logger, MaxSessions: 100,
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := NewManager("", test.deps); err == nil {
				t.Fatalf("NewManager() accepted nil %s", test.name)
			}
		})
	}
}

func TestCreateRejectsTalkModeBeforePeerConnectionAndPipeline(t *testing.T) {
	factory := &countingPipelineFactory{}
	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: factory,
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	if _, err := manager.Create(context.Background(), Offer{
		Type: "offer", SDP: "invalid but non-empty", TalkMode: "other", OfferRequestID: rtcTestOfferRequestID,
	}); err == nil {
		t.Fatal("Create() accepted invalid talk mode")
	}
	if factory.calls != 0 {
		t.Fatalf("pipeline factory calls = %d, want 0", factory.calls)
	}
	if manager.Count() != 0 {
		t.Fatalf("manager Count() = %d, want 0", manager.Count())
	}
}

func TestCloseAllDeadlineDoesNotForgeDoneOrRegistryRemoval(t *testing.T) {
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
	done := make(chan struct{})
	manager.sessions["joining"] = &Session{
		lifecycle: &sessionLifecycle{state: stateClosing},
		done:      done,
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	if err := manager.CloseAll(ctx, "test"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("CloseAll() error = %v, want deadline exceeded", err)
	}
	select {
	case <-done:
		t.Fatal("CloseAll deadline forged Session.done")
	default:
	}
	if manager.Count() != 1 {
		t.Fatalf("Count() = %d, want joining session retained", manager.Count())
	}
}

type countingPipelineFactory struct {
	calls int
}

func (f *countingPipelineFactory) Connect(
	context.Context,
	string,
	string,
) (pipeline.ClientSet, error) {
	f.calls++
	return nil, errors.New("unexpected pipeline connect")
}
