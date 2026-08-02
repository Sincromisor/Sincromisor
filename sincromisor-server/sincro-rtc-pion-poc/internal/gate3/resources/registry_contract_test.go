package resources

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
)

func TestCollectorConsumesProductionRegistryPrometheusText(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	registry := observability.NewRegistry()
	registry.SessionCreated()
	registry.QueueDepthDelta("input", 2)
	mux := http.NewServeMux()
	mux.Handle("/metrics", registry.Handler())
	mux.HandleFunc("/statuses", func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(
			`{"sessions":1,"session_limit":100,"ready":true,"draining":false}`,
		))
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	collector, err := newCollector(Config{
		PID: 4242, ProcRoot: procRoot,
		MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	sample, err := collector.collect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if sample.Sessions != 1 || sample.Queues.Input != 2 ||
		sample.Queues.Speech != 0 || sample.Queues.Text != 0 || sample.Queues.Telop != 0 {
		t.Fatalf("production Registry sample = %+v", sample)
	}
}
