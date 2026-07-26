package client

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// TestAcceptanceCloseHonorsConfiguredTimeout verifies that the wrapper's
// configured close deadline actually bounds Close when the peer never reads or
// acknowledges the close frame.
func TestAcceptanceCloseHonorsConfiguredTimeout(t *testing.T) {
	releaseServer := make(chan struct{})
	server, endpoint := websocketServer(t, func(
		_ context.Context,
		_ *websocket.Conn,
		_ *http.Request,
	) {
		<-releaseServer
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
}
