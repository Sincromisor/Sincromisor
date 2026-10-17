package pipeline

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/coder/websocket"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

// 中央結合試験だけが指定する保存先へ、本番client/CoordinatorのJSONLをそのまま出す。
func TestCentralLogFixture(t *testing.T) {
	dir := os.Getenv("SINCRO_DIAGNOSTIC_FIXTURE_DIR")
	if dir == "" {
		t.Skip("中央結合試験専用")
	}
	output, err := os.Create(filepath.Join(dir, "go-websocket.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	defer output.Close()
	harness := newFixtureWebSocketHarness(t)
	defer harness.Close()
	c, waiter := newWebSocketCoordinator(t, harness)
	c.logger = slog.New(slog.NewJSONHandler(output, nil))
	if err := c.Start(context.Background(), "fixture-session", "sincro"); err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	runWebSocketTurn(t, c, 1)
	harness.resolver.failNextExtractor.Store(true)
	state := harness.states[pclient.ServiceSynthesizer]
	state.mu.Lock()
	connections := make([]*websocket.Conn, 0, len(state.conns))
	for conn := range state.conns {
		connections = append(connections, conn)
	}
	state.mu.Unlock()
	for _, conn := range connections {
		go conn.Close(websocket.StatusInternalError, "keepalive ping timeout")
	}
	waitFor(t, func() bool { c.mu.Lock(); defer c.mu.Unlock(); return c.state == StateRunning && c.generation == 2 })
	if waiter.retryCount() != 1 {
		t.Fatal("missing failed attempt")
	}
	if err := c.Close(); err != nil {
		t.Fatal(err)
	}
	harness.waitActive(t, 0)
	harness.assertNoError(t)
}
