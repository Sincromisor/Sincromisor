package client

import (
	"context"
	"net/http"
	"runtime"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestCloseHonorsConfiguredTimeoutAndJoinsLifecycle(t *testing.T) {
	releaseServer := make(chan struct{})
	serverRead := make(chan error, 1)
	server, endpoint := websocketServer(t, func(
		ctx context.Context,
		conn *websocket.Conn,
		_ *http.Request,
	) {
		<-releaseServer
		_, _, err := conn.Read(ctx)
		serverRead <- err
	})
	defer server.Close()

	cfg := testConfig("chat")
	cfg.CloseTimeout = 30 * time.Millisecond
	client, err := NewRecognizer(cfg, fakeResolver{endpoint: endpoint}, testLogger())
	if err != nil {
		t.Fatalf("NewRecognizer() error = %v", err)
	}
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	startedAt := time.Now()
	closeErr := client.Close()
	elapsed := time.Since(startedAt)
	close(releaseServer)
	if closeErr != nil {
		t.Fatalf("Close() took %v and returned error = %v", elapsed, closeErr)
	}
	if elapsed > 500*time.Millisecond {
		t.Fatalf("Close() took %v with a 30ms configured timeout", elapsed)
	}
	if _, ok := <-client.Results(); ok {
		t.Fatal("Results channel remains open after Close")
	}
	if _, ok := <-client.Events(); ok {
		t.Fatal("Events channel remains open after Close")
	}
	select {
	case err := <-serverRead:
		if err == nil {
			t.Fatal("server read succeeded after client force-close")
		}
	case <-time.After(time.Second):
		t.Fatal("server did not observe the closed underlying socket")
	}
}

func TestRepeatedCloseTimeoutDoesNotLeaveHelpers(t *testing.T) {
	baseline := runtime.NumGoroutine()
	for attempt := 0; attempt < 5; attempt++ {
		releaseServer := make(chan struct{})
		serverRead := make(chan error, 1)
		server, endpoint := websocketServer(t, func(
			ctx context.Context,
			conn *websocket.Conn,
			_ *http.Request,
		) {
			<-releaseServer
			_, _, err := conn.Read(ctx)
			serverRead <- err
		})
		cfg := testConfig("chat")
		cfg.CloseTimeout = 10 * time.Millisecond
		client, err := NewRecognizer(cfg, fakeResolver{endpoint: endpoint}, testLogger())
		if err != nil {
			t.Fatalf("attempt %d NewRecognizer() error = %v", attempt, err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("attempt %d Connect() error = %v", attempt, err)
		}
		if err := client.Close(); err != nil {
			t.Fatalf("attempt %d Close() error = %v", attempt, err)
		}
		close(releaseServer)
		select {
		case err := <-serverRead:
			if err == nil {
				t.Fatalf("attempt %d server read succeeded after force-close", attempt)
			}
		case <-time.After(time.Second):
			t.Fatalf("attempt %d server did not observe socket close", attempt)
		}
		server.Close()
	}

	deadline := time.Now().Add(time.Second)
	for runtime.NumGoroutine() > baseline+4 && time.Now().Before(deadline) {
		runtime.Gosched()
	}
	if got := runtime.NumGoroutine(); got > baseline+4 {
		t.Fatalf("goroutines after repeated Close = %d, baseline = %d", got, baseline)
	}
}
