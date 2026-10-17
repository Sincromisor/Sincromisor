package client

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/coder/websocket"
)

func TestCloseDiagnosticsUseReceivedFramesOnly(t *testing.T) {
	for _, tt := range []struct {
		name       string
		code       websocket.StatusCode
		reason     string
		wantReason string
	}{
		{"keepalive", 1011, "keepalive ping timeout", "keepalive_ping_timeout"},
		{"normal", 1000, "", "unknown"},
		{"private reason", 1011, "secret-close-marker", "unknown"},
		{"transport EOF", 0, "", ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			server, endpoint := websocketServer(t, func(_ context.Context, conn *websocket.Conn, _ *http.Request) {
				if tt.code == 0 {
					_ = conn.CloseNow()
				} else {
					_ = conn.Close(tt.code, tt.reason)
				}
			})
			defer server.Close()
			client, err := NewRecognizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
			if err != nil {
				t.Fatal(err)
			}
			if err := client.Connect(context.Background()); err != nil {
				t.Fatal(err)
			}
			defer client.Close()
			kind := EventRemoteClose
			if tt.code == 0 {
				kind = EventReadFailed
			}
			event := assertSingleTerminalEvent(t, client.Events(), kind)
			attrs := event.DiagnosticAttrs()
			fields := map[string]any{}
			for i := 0; i < len(attrs); i += 2 {
				fields[attrs[i].(string)] = attrs[i+1]
			}
			if fields["operation"] != "read" {
				t.Fatalf("operation = %v", fields)
			}
			if tt.code == 0 {
				if _, ok := fields["close_code"]; ok {
					t.Fatalf("invented code: %v", fields)
				}
			} else if fields["close_code"] != int(tt.code) || fields["close_reason"] != tt.wantReason {
				t.Fatalf("close diagnosis = %v", fields)
			}
			if strings.Contains(fmt.Sprint(fields), "secret-close-marker") {
				t.Fatal("close reason exposed")
			}
		})
	}
}
