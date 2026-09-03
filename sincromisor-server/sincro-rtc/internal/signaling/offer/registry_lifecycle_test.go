package offer

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"runtime"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
)

func TestOfferRegistryOwnerPanicReleasesWaiterAndEntry(t *testing.T) {
	service := &registrySessionService{panicCreate: true}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	defer cancel()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("payload-sdp-marker"),
		validRTCOffer(),
	); err == nil {
		t.Fatal("Resolve() error = nil after owner panic")
	}
	waitRegistryEntries(t, registry, 0)
}

func TestOfferRegistrySweeperAndWaitHelperRecoverPanics(t *testing.T) {
	t.Run("sweeper", func(t *testing.T) {
		processCtx, cancel := context.WithCancel(context.Background())
		defer cancel()
		registry, err := New(&registrySessionService{}, Config{
			ProcessContext: processCtx,
			GatherTimeout:  time.Second,
			Capacity:       1,
			TTL:            time.Minute,
			Clock:          panicRegistryClock{},
			Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		})
		if err != nil {
			t.Fatal(err)
		}
		ctx, stop := context.WithTimeout(context.Background(), time.Second)
		defer stop()
		if err := registry.Wait(ctx); err != nil {
			t.Fatalf("Wait() after sweeper panic = %v", err)
		}
	})

	t.Run("wait helper", func(t *testing.T) {
		registry, cancel := newRegistryForTest(t, &registrySessionService{}, 1, newRegistryFakeClock())
		defer cancel()
		result := registry.startJoin(func() { panic("payload-chat-marker") })
		if err := <-result; err == nil {
			t.Fatal("wait helper panic did not become an error")
		}
	})
}

func TestOfferRegistryLifecycleLogOmitsRequestAndPayload(t *testing.T) {
	var logs bytes.Buffer
	processCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service := &registrySessionService{answer: rtc.Answer{
		SDP:  "payload-sdp-marker",
		Type: "answer", SessionID: "01K1AF2Y0H0000000000000002", Revision: 1,
	}}
	registry, err := New(service, Config{
		ProcessContext: processCtx,
		GatherTimeout:  time.Second,
		Capacity:       1,
		TTL:            time.Minute,
		Clock:          newRegistryFakeClock(),
		Logger:         slog.New(slog.NewJSONHandler(&logs, nil)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Resolve(
		context.Background(), testOfferRequestID, []byte("payload-sdp-marker"), validRTCOffer(),
	); err != nil {
		t.Fatal(err)
	}
	service.closeSession()
	for _, forbidden := range []string{testOfferRequestID, "payload-sdp-marker", "offer_request_id"} {
		if bytes.Contains(logs.Bytes(), []byte(forbidden)) {
			t.Fatalf("Offer lifecycle log exposed %q: %s", forbidden, logs.String())
		}
	}
}

func TestOfferRegistryTimeoutLeavesNoEntryOrGoroutine(t *testing.T) {
	baseline := runtime.NumGoroutine()
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	registry, cancel := newRegistryForTestWithTimeout(
		t, service, 1, newRegistryFakeClock(), 5*time.Millisecond,
	)
	recorder := &recordingOfferRecorder{Recorder: observability.Discard()}
	registry.config.Recorder = recorder
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Resolve() error = %v, want deadline exceeded", err)
	}
	waitRegistryEntries(t, registry, 0)
	if recorder.gatherDeadlines.Load() != 1 {
		t.Fatalf("gather deadline metric = %d, want 1", recorder.gatherDeadlines.Load())
	}
	cancel()
	waitCtx, cancelWait := context.WithTimeout(context.Background(), time.Second)
	defer cancelWait()
	if err := registry.Wait(waitCtx); err != nil {
		t.Fatalf("Wait() error = %v", err)
	}
	waitForSignalingCondition(t, time.Second, func() bool {
		return runtime.NumGoroutine() <= baseline+1
	})
}

// recordingOfferRecorder は収集期限だけを数え、試験対象外の観測を破棄する。
type recordingOfferRecorder struct {
	observability.Recorder
	gatherDeadlines atomic.Int32
}

func (r *recordingOfferRecorder) Deadline(stage string) {
	if stage == "gather" {
		r.gatherDeadlines.Add(1)
	}
}

func TestOfferRegistryProcessCancelJoinsOwnerAndSweeper(t *testing.T) {
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	result := make(chan error, 1)
	go func() {
		_, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer())
		result <- err
	}()
	<-service.started
	cancel()
	waitCtx, cancelWait := context.WithTimeout(context.Background(), time.Second)
	defer cancelWait()
	if err := registry.Wait(waitCtx); err != nil {
		t.Fatalf("Wait() error = %v", err)
	}
	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Fatalf("owner result = %v, want process cancellation", err)
	}
}
