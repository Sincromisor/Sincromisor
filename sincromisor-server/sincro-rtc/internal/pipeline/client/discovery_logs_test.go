package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

func TestDiscoveryFallbackLogsDistinguishSafeCauses(t *testing.T) {
	for _, tt := range []struct {
		reason, body string
		status       int
		delay        time.Duration
	}{
		{"http_failure", "secret-body", 503, 0},
		{"invalid_response", "secret-body", 200, 0},
		{"no_healthy_instance", "[]", 200, 0},
		{"timeout", "", 200, 50 * time.Millisecond},
	} {
		t.Run(tt.reason, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				time.Sleep(tt.delay)
				w.WriteHeader(tt.status)
				fmt.Fprint(w, tt.body)
			}))
			defer server.Close()
			resolver, err := discovery.NewResolver(discovery.ResolverConfig{ConsulBaseURL: server.URL, FallbackHost: "127.0.0.1", FallbackPort: 1, RequestTimeout: 20 * time.Millisecond}, server.Client(), nil)
			if err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			client, err := NewRecognizer(testConfig("chat"), resolver, slog.New(slog.NewJSONHandler(&logs, nil)))
			if err != nil {
				t.Fatal(err)
			}
			_ = client.Connect(context.Background())
			_ = client.Close()
			var row map[string]any
			if err := json.Unmarshal(bytes.TrimSpace(logs.Bytes()), &row); err != nil {
				t.Fatal(err)
			}
			if row["reason"] != tt.reason || row["peer"] != string(ServiceRecognizer) || row["discovery_source"] != "consul" || row["duration_ms"] == nil {
				t.Fatalf("diagnosis=%v", row)
			}
			if tt.reason != "timeout" && row["http_status"] != float64(tt.status) {
				t.Fatalf("status=%v", row)
			}
			if strings.Contains(logs.String(), "secret-body") || strings.Contains(logs.String(), server.URL) {
				t.Fatal("discovery payload exposed")
			}
		})
	}
}
