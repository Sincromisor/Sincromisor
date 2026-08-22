package main

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestShutdownProcessKeepsHTTPUntilAdmissionWindowAndCleanupComplete(t *testing.T) {
	startedAt := time.Now()
	var drainStarted atomic.Bool
	var processCancelled atomic.Bool
	admissionStarted := make(chan struct{})
	releaseAdmission := make(chan struct{})
	deregisterStarted := make(chan struct{})
	offerContext := make(chan context.Context, 1)
	sessionContext := make(chan context.Context, 1)
	httpContext := make(chan context.Context, 1)
	result := make(chan error, 1)

	go func() {
		result <- shutdownProcess(shutdownOperations{
			BeginDrain: func() {
				drainStarted.Store(true)
			},
			CancelProcess: func() {
				if !drainStarted.Load() {
					t.Error("CancelProcess ran before BeginDrain")
				}
				processCancelled.Store(true)
			},
			Deregister: func(ctx context.Context) error {
				if !drainStarted.Load() || !processCancelled.Load() {
					t.Error("Deregister ran before draining and process cancellation")
				}
				close(deregisterStarted)
				<-ctx.Done()
				return ctx.Err()
			},
			WaitOffers: func(ctx context.Context) error {
				if !drainStarted.Load() || !processCancelled.Load() {
					t.Error("WaitOffers ran before admission changed and process was cancelled")
				}
				offerContext <- ctx
				return nil
			},
			CloseSessions: func(ctx context.Context, reason string) error {
				if !drainStarted.Load() || !processCancelled.Load() {
					t.Error("CloseSessions ran before admission changed and process was cancelled")
				}
				if reason != "process_shutdown" {
					t.Errorf("CloseSessions reason = %q, want process_shutdown", reason)
				}
				sessionContext <- ctx
				return nil
			},
			ShutdownHTTP: func(ctx context.Context) error {
				httpContext <- ctx
				return nil
			},
			WaitAdmissionWindow: func(ctx context.Context) error {
				close(admissionStarted)
				select {
				case <-releaseAdmission:
					return nil
				case <-ctx.Done():
					return ctx.Err()
				}
			},
		})
	}()

	<-admissionStarted
	<-deregisterStarted
	offerCtx := <-offerContext
	sessionCtx := <-sessionContext
	if offerCtx != sessionCtx {
		t.Fatal("WaitOffers and CloseSessions did not share the same cleanup context")
	}
	assertContextTimeout(t, offerCtx, startedAt, shutdownCleanupTimeout)
	select {
	case <-httpContext:
		t.Fatal("ShutdownHTTP ran before the admission window completed")
	default:
	}

	close(releaseAdmission)
	httpCtx := <-httpContext
	assertContextTimeout(t, httpCtx, time.Now(), shutdownHTTPTimeout)
	if err := <-result; !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("shutdownProcess() error = %v, want deregistration timeout while cleanup continues", err)
	}
}

func TestShutdownProcessReturnsEveryOperationError(t *testing.T) {
	offerErr := errors.New("offer wait failed")
	sessionErr := errors.New("session close failed")
	admissionErr := errors.New("admission window failed")
	httpErr := errors.New("http shutdown failed")

	err := shutdownProcess(shutdownOperations{
		BeginDrain:    func() {},
		CancelProcess: func() {},
		WaitOffers: func(context.Context) error {
			return offerErr
		},
		CloseSessions: func(context.Context, string) error {
			return sessionErr
		},
		ShutdownHTTP: func(context.Context) error {
			return httpErr
		},
		WaitAdmissionWindow: func(context.Context) error {
			return admissionErr
		},
	})
	for _, target := range []error{offerErr, sessionErr, admissionErr, httpErr} {
		if !errors.Is(err, target) {
			t.Errorf("shutdownProcess() error = %v, want errors.Is(_, %v)", err, target)
		}
	}
}

func TestShutdownProcessAppliesCleanupThenHTTPTimeout(t *testing.T) {
	startedAt := time.Now()
	err := shutdownProcess(shutdownOperations{
		BeginDrain:    func() {},
		CancelProcess: func() {},
		WaitOffers: func(ctx context.Context) error {
			<-ctx.Done()
			return ctx.Err()
		},
		CloseSessions: func(ctx context.Context, _ string) error {
			<-ctx.Done()
			return ctx.Err()
		},
		ShutdownHTTP: func(ctx context.Context) error {
			<-ctx.Done()
			return ctx.Err()
		},
		WaitAdmissionWindow: func(context.Context) error {
			return nil
		},
	})
	elapsed := time.Since(startedAt)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("shutdownProcess() error = %v, want context deadline exceeded", err)
	}
	if elapsed < shutdownCleanupTimeout+shutdownHTTPTimeout {
		t.Fatalf("shutdownProcess() elapsed = %s, want at least %s", elapsed, shutdownCleanupTimeout+shutdownHTTPTimeout)
	}
	if elapsed > shutdownCleanupTimeout+shutdownHTTPTimeout+500*time.Millisecond {
		t.Fatalf("shutdownProcess() elapsed = %s, want at most 6.5s", elapsed)
	}
}

func assertContextTimeout(t *testing.T, ctx context.Context, startedAt time.Time, want time.Duration) {
	t.Helper()
	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("context has no deadline")
	}
	got := deadline.Sub(startedAt)
	const tolerance = 250 * time.Millisecond
	if got < want-tolerance || got > want+tolerance {
		t.Fatalf("context timeout = %s, want %s ± %s", got, want, tolerance)
	}
}
