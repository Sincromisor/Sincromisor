package pipeline

import (
	"context"
	"io"
	"log/slog"
	"sync"
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

func TestInputQueueConcurrentPopAndCloseBalancesOwnership(t *testing.T) {
	for range 100 {
		observer := &recordingPipelineObserver{}
		queue := newFrameQueue(observer)
		for range inputQueueCapacity {
			queue.push(make([]byte, pcmFrameBytes))
		}
		var consumers sync.WaitGroup
		for range 8 {
			consumers.Add(1)
			go func() {
				defer consumers.Done()
				for {
					if _, ok := queue.pop(context.Background()); !ok {
						return
					}
				}
			}()
		}
		queue.close()
		consumers.Wait()
		depth, minimum := observer.queueSnapshot()
		if depth != 0 || minimum < 0 {
			t.Fatalf("queue ownership depth/minimum = %v/%v, want 0/non-negative", depth, minimum)
		}
	}
}
