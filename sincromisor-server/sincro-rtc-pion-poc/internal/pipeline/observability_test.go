package pipeline

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
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

func TestReconnectShutdownRaceRecordsFailureTerminal(t *testing.T) {
	coordinator := newTestCoordinator(t, &fakeFactory{t: t})
	observer := &recordingPipelineObserver{reconnects: make(chan string, 4)}
	if err := coordinator.ConfigureRuntime(observer, func(string) {}); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.Start(context.Background(), "session-reconnect-shutdown", "chat"); err != nil {
		t.Fatal(err)
	}
	coordinator.outputMu.Lock()
	resetDone := make(chan struct{})
	go func() {
		coordinator.requestReset(1, pclient.ServiceProcessor, io.ErrUnexpectedEOF)
		close(resetDone)
	}()
	if result := <-observer.reconnects; result != "start" {
		t.Fatalf("first reconnect result = %q, want start", result)
	}
	closeDone := make(chan error, 1)
	go func() { closeDone <- coordinator.Close() }()
	for {
		coordinator.mu.Lock()
		closed := coordinator.state == StateClosed
		coordinator.mu.Unlock()
		if closed {
			break
		}
		time.Sleep(time.Millisecond)
	}
	coordinator.outputMu.Unlock()
	<-resetDone
	if result := <-observer.reconnects; result != "failure" {
		t.Fatalf("terminal reconnect result = %q, want failure", result)
	}
	if err := <-closeDone; err != nil {
		t.Fatal(err)
	}
	select {
	case extra := <-observer.reconnects:
		t.Fatalf("unexpected reconnect result %q", extra)
	default:
	}
}

func TestPipelineTransitionLogUsesFiniteOperationalFields(t *testing.T) {
	var logs bytes.Buffer
	coordinator, err := newCoordinatorWithHooks(
		&fakeFactory{t: t},
		slog.New(slog.NewJSONHandler(&logs, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		nonExpiringOutputWait,
	)
	if err != nil {
		t.Fatal(err)
	}
	coordinator.mu.Lock()
	err = coordinator.transitionLocked(StateRunning)
	coordinator.mu.Unlock()
	if err == nil {
		t.Fatal("invalid transition succeeded")
	}
	for _, forbidden := range []string{`"from"`, `"to"`, "payload-chat-marker"} {
		if strings.Contains(logs.String(), forbidden) {
			t.Fatalf("pipeline transition log exposed %q: %s", forbidden, logs.String())
		}
	}
	if !strings.Contains(logs.String(), `"stage":"pipeline_state"`) ||
		!strings.Contains(logs.String(), `"reason":"invalid_transition"`) {
		t.Fatalf("normalized transition log missing: %s", logs.String())
	}
}

type recordingPipelineObserver struct {
	mu         sync.Mutex
	queueDepth float64
	minimum    float64
	reconnects chan string
	overflows  int
}

func (r *recordingPipelineObserver) PipelineReconnect(_ string, result string) {
	if r.reconnects != nil {
		r.reconnects <- result
	}
}
func (r *recordingPipelineObserver) QueueDepthDelta(_ string, delta float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.queueDepth += delta
	if r.queueDepth < r.minimum {
		r.minimum = r.queueDepth
	}
}
func (r *recordingPipelineObserver) QueueOverflow(string, string) {
	r.mu.Lock()
	r.overflows++
	r.mu.Unlock()
}
func (r *recordingPipelineObserver) queueSnapshot() (float64, float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.queueDepth, r.minimum
}
