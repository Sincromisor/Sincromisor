package rtc

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

func TestNewManagerRejectsNilDependencies(t *testing.T) {
	valid := ManagerDependencies{
		PipelineFactory: blockingPipelineFactory{},
		Clock:           SystemClock{},
		Logger:          testLogger(),
	}
	tests := []struct {
		name string
		deps ManagerDependencies
	}{
		{name: "pipeline factory", deps: ManagerDependencies{Clock: valid.Clock, Logger: valid.Logger}},
		{name: "clock", deps: ManagerDependencies{PipelineFactory: valid.PipelineFactory, Logger: valid.Logger}},
		{name: "logger", deps: ManagerDependencies{PipelineFactory: valid.PipelineFactory, Clock: valid.Clock}},
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
	manager, err := NewManager("", ManagerDependencies{
		PipelineFactory: factory,
		Clock:           SystemClock{},
		Logger:          testLogger(),
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
	manager, err := NewManager("", ManagerDependencies{
		PipelineFactory: blockingPipelineFactory{},
		Clock:           SystemClock{},
		Logger:          testLogger(),
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
