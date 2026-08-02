package pipeline

import (
	"io"
	"log/slog"
	"testing"
	"time"
)

func TestCoordinatorWorkerPanicUsesConfiguredSessionBoundary(t *testing.T) {
	coordinator, err := NewCoordinator(
		&fakeFactory{t: t},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	observer := &recordingPipelineObserver{}
	recovered := make(chan string, 1)
	if err := coordinator.ConfigureRuntime(observer, func(stage string) { recovered <- stage }); err != nil {
		t.Fatal(err)
	}
	work := &generationWork{}
	work.wg.Add(1)
	coordinator.goWork(work, "pipeline_test_stage", func() { panic("payload-chat-marker") })
	work.wg.Wait()
	select {
	case stage := <-recovered:
		if stage != "pipeline_test_stage" {
			t.Fatalf("panic stage = %q", stage)
		}
	case <-time.After(time.Second):
		t.Fatal("pipeline panic did not reach owner")
	}
}

type recordingPipelineObserver struct{}

func (*recordingPipelineObserver) PipelineReconnect(string, string) {}
func (*recordingPipelineObserver) QueueDepthDelta(string, float64)  {}
func (*recordingPipelineObserver) QueueOverflow(string, string)     {}
