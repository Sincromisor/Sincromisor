package rtc

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

func TestManagerReservationNeverExceedsCapacity(t *testing.T) {
	manager := &Manager{sessions: make(map[string]*Session), maxSessions: 100}
	release := make(chan struct{})
	var admitted atomic.Int32
	var peak atomic.Int32
	var wg sync.WaitGroup
	for range 101 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := manager.reserve(); err != nil {
				if !errors.Is(err, ErrSessionCapacity) {
					t.Errorf("reserve error = %v", err)
				}
				return
			}
			current := admitted.Add(1)
			for {
				old := peak.Load()
				if current <= old || peak.CompareAndSwap(old, current) {
					break
				}
			}
			<-release
			admitted.Add(-1)
			manager.releaseReservation()
		}()
	}
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for admitted.Load() < 100 {
		select {
		case <-deadline.C:
			t.Fatalf("admitted = %d, want 100", admitted.Load())
		default:
		}
	}
	close(release)
	wg.Wait()
	if got := peak.Load(); got != 100 {
		t.Fatalf("peak reservations = %d, want 100", got)
	}
	if manager.reservations != 0 {
		t.Fatalf("reservations = %d, want 0", manager.reservations)
	}
}

func TestNewManagerRejectsNilDependencies(t *testing.T) {
	valid := ManagerConfig{
		PipelineFactory: blockingPipelineFactory{},
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
	}
	tests := []struct {
		name string
		deps ManagerConfig
	}{
		{name: "pipeline factory", deps: ManagerConfig{
			InputObserver: valid.InputObserver, Clock: valid.Clock, Logger: valid.Logger, MaxSessions: 100,
		}},
		{name: "input observer", deps: ManagerConfig{
			PipelineFactory: valid.PipelineFactory, Clock: valid.Clock, Logger: valid.Logger, MaxSessions: 100,
		}},
		{name: "clock", deps: ManagerConfig{
			PipelineFactory: valid.PipelineFactory, InputObserver: valid.InputObserver, Logger: valid.Logger, MaxSessions: 100,
		}},
		{name: "logger", deps: ManagerConfig{
			PipelineFactory: valid.PipelineFactory, InputObserver: valid.InputObserver, Clock: valid.Clock, MaxSessions: 100,
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
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	if _, err := manager.Create(context.Background(), Offer{
		Type: "offer", SDP: "invalid but non-empty", TalkMode: "other",
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
