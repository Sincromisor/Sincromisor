package pipeline

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/diagnostics"
	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

func TestPanicEventKeepsOriginThroughReset(t *testing.T) {
	var logs bytes.Buffer
	factory := &fakeFactory{t: t}
	c := newTestCoordinator(t, factory)
	c.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	if err := c.Start(context.Background(), "panic-session", "sincro"); err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	func() {
		defer func() {
			if recover() != nil {
				event := pclient.Event{Service: pclient.ServiceSynthesizer, Kind: pclient.EventPanic, Operation: "read", Err: diagnostics.CapturePanic()}
				c.onClientEvent(1, event)
				c.onClientEvent(1, event)
			}
		}()
		panic("secret-panic-argument")
	}()
	waitFor(t, func() bool { return factory.count() == 2 })
	if err := c.Close(); err != nil {
		t.Fatal(err)
	}
	text := logs.String()
	for _, want := range []string{`"session_id":"panic-session"`, `"generation":1`, `"reason":"panic"`, `"panic_frames":`, `"file":"panic_diagnostics_test.go"`, "TestPanicEventKeepsOriginThroughReset"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %s: %s", want, text)
		}
	}
	if strings.Count(text, `"msg":"pipeline_reset_requested"`) != 1 || strings.Contains(text, "secret-") {
		t.Fatal(text)
	}
}
