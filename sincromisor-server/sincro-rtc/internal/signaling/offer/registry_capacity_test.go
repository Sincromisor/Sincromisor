package offer

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
)

func TestOfferRegistryCapacityTombstoneAndExpiry(t *testing.T) {
	clock := newRegistryFakeClock()
	service := &registrySessionService{
		answer: rtc.Answer{
			SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000002", Revision: 1,
		},
	}
	registry, cancel := newRegistryForTest(t, service, 1, clock)
	defer cancel()
	if _, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer()); err != nil {
		t.Fatalf("first Resolve() error = %v", err)
	}
	if _, err := registry.Resolve(
		context.Background(),
		"c2ef4b63-30eb-42ee-a281-66b23ba789b4",
		[]byte("other"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("capacity error = %v, want ErrOfferCapacity", err)
	}
	service.closeSession()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferGone) {
		t.Fatalf("tombstone error = %v, want ErrOfferGone", err)
	}
	clock.Advance(2 * time.Minute)
	if _, err := registry.Resolve(
		context.Background(),
		"c2ef4b63-30eb-42ee-a281-66b23ba789b4",
		[]byte("other"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("Resolve after expiry error = %v", err)
	}
}

func TestOfferRegistryInFlightCountsTowardCapacity(t *testing.T) {
	service := &registrySessionService{
		started: make(chan struct{}),
		release: make(chan struct{}),
		answer: rtc.Answer{
			SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000008", Revision: 1,
		},
	}
	registry, cancel := newRegistryForTest(t, service, 1, newRegistryFakeClock())
	defer cancel()
	first := make(chan error, 1)
	go func() {
		_, err := registry.Resolve(context.Background(), testOfferRequestID, []byte("same"), validRTCOffer())
		first <- err
	}()
	<-service.started
	if _, err := registry.Resolve(
		context.Background(),
		"95ff8fd1-2bcb-4dc6-bf9b-990b357f12cc",
		[]byte("other"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("in-flight capacity error = %v, want ErrOfferCapacity", err)
	}
	registry.mu.Lock()
	entryCount := len(registry.entries)
	registry.mu.Unlock()
	if entryCount != 1 || service.calls.Load() != 1 {
		t.Fatalf("failed admission left entries/calls = %d/%d, want 1/1", entryCount, service.calls.Load())
	}
	close(service.release)
	if err := <-first; err != nil {
		t.Fatalf("first Resolve() error = %v", err)
	}
}

func TestOfferRegistryDoesNotEvictLiveEntryImmediatelyBeforeTTL(t *testing.T) {
	clock := newRegistryFakeClock()
	service := &registrySessionService{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000009", Revision: 1,
	}}
	registry, cancel := newRegistryForTest(t, service, 1, clock)
	defer cancel()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("first Resolve() error = %v", err)
	}
	clock.Advance(2*time.Minute - time.Nanosecond)
	if _, err := registry.Resolve(
		context.Background(),
		"95ff8fd1-2bcb-4dc6-bf9b-990b357f12cc",
		[]byte("other"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("pre-expiry admission error = %v, want ErrOfferCapacity", err)
	}
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("pre-expiry cached Resolve() error = %v", err)
	}
	clock.Advance(time.Nanosecond)
	if _, err := registry.Resolve(
		context.Background(),
		"95ff8fd1-2bcb-4dc6-bf9b-990b357f12cc",
		[]byte("other"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("at-expiry admission error = %v", err)
	}
}

func TestOfferRegistryThousandEntryBoundary(t *testing.T) {
	service := &registrySessionService{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000005", Revision: 1,
	}}
	registry, cancel := newRegistryForTest(t, service, 1000, newRegistryFakeClock())
	defer cancel()
	for index := range 1000 {
		requestID := uuidForIndex(index)
		if _, err := registry.Resolve(
			context.Background(),
			requestID,
			[]byte(requestID),
			validRTCOffer(),
		); err != nil {
			t.Fatalf("Resolve(%d) error = %v", index, err)
		}
	}
	if _, err := registry.Resolve(
		context.Background(),
		uuidForIndex(1000),
		[]byte("over"),
		validRTCOffer(),
	); !errors.Is(err, ErrOfferCapacity) {
		t.Fatalf("1001st Resolve error = %v, want ErrOfferCapacity", err)
	}
}

func TestOfferRegistryPeriodicSweepRemovesExpiredEntries(t *testing.T) {
	clock := newRegistryFakeClock()
	service := &registrySessionService{answer: rtc.Answer{
		SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000007", Revision: 1,
	}}
	registry, cancel := newRegistryForTest(t, service, 1, clock)
	defer cancel()
	if _, err := registry.Resolve(
		context.Background(),
		testOfferRequestID,
		[]byte("same"),
		validRTCOffer(),
	); err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	select {
	case interval := <-clock.intervals:
		if interval != 30*time.Second {
			t.Fatalf("sweep interval = %s, want 30s", interval)
		}
	case <-time.After(time.Second):
		t.Fatal("sweeper did not request its first interval")
	}
	clock.Advance(2 * time.Minute)
	clock.Tick()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		registry.mu.Lock()
		count := len(registry.entries)
		registry.mu.Unlock()
		if count == 0 {
			return
		}
		select {
		case <-deadline.C:
			t.Fatalf("periodic sweep retained %d expired entries", count)
		default:
		}
	}
}
