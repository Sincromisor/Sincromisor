//go:build gate3

package consuldev

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/pipelinecontract"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/wsproxy"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func TestConsulProxyAndPipelineOwnersExposeOneCoherentScenario(t *testing.T) {
	fixtures, err := filepath.Abs(filepath.Join("..", "..", "pipeline", "protocol", "testdata"))
	if err != nil {
		t.Fatal(err)
	}
	contracts, err := pipelinecontract.New(pipelinecontract.Config{
		FixturesDir: fixtures, ListenHost: "127.0.0.1",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer closeContracts(t, contracts)
	proxies, err := wsproxy.NewSet(wsproxy.Config{
		Upstreams: contracts.Addresses(), ListenHost: "127.0.0.1",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer closeProxies(t, proxies)

	options := isolatedOptions(t, 500*time.Millisecond)
	cfg := fakeConfig(t, options, "")
	cfg.Services = proxies.Addresses()
	agent, err := startUsingOptions(t, cfg, options)
	if err != nil {
		t.Fatalf("start() error = %v", err)
	}
	defer func() {
		if closeErr := agent.Close(context.Background()); closeErr != nil {
			t.Errorf("Agent.Close() error = %v", closeErr)
		}
	}()
	assertRegisteredHealth(t, agent.baseURL, proxies.Addresses())
	assertExactlyFourRegistrations(t, agent.baseURL)

	resolver, err := discovery.NewResolver(discovery.ResolverConfig{
		ConsulBaseURL: agent.baseURL, FallbackHost: "127.0.0.1",
		FallbackPort: 1, RequestTimeout: time.Second,
	}, nil, func(int) (int, error) { return 0, nil })
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	factory, err := pclient.NewSetFactory(resolver, logger, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	coordinator, err := pipeline.NewCoordinator(factory, logger)
	if err != nil {
		t.Fatal(err)
	}
	registry := observability.NewRegistry()
	var panicCount atomic.Int64
	if err := coordinator.ConfigureRuntime(registry, func(string) { panicCount.Add(1) }); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.Start(context.Background(), "gate3-consul-owner-session", "sincro"); err != nil {
		t.Fatalf("Coordinator.Start() error = %v", err)
	}
	runOwnerTurn(t, coordinator)
	for service, counts := range proxies.Ledger().Connections {
		if counts.Accepted != 1 || counts.Active != 1 || counts.Closed != 0 {
			t.Fatalf("%s counts while running = %+v, want 1/1/0", service, counts)
		}
	}
	if panicCount.Load() != 0 {
		t.Fatalf("panic callback count = %d, want 0", panicCount.Load())
	}
	if err := contracts.Verify(); err != nil {
		t.Fatalf("contract Verify() error = %v", err)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Coordinator.Close() error = %v", err)
	}
	waitProxyCounts(t, proxies, 0, 1)
}

func assertExactlyFourRegistrations(t *testing.T, baseURL string) {
	t.Helper()
	response, err := http.Get(baseURL + "/v1/agent/services")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var registrations map[string]fakeRegistration
	if err := json.NewDecoder(response.Body).Decode(&registrations); err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{
		ExtractorServiceID: true, RecognizerServiceID: true,
		ProcessorServiceID: true, SynthesizerServiceID: true,
	}
	if len(registrations) != len(want) {
		t.Fatalf("registration count = %d, want 4: %+v", len(registrations), registrations)
	}
	for id := range registrations {
		if !want[id] {
			t.Fatalf("unexpected registration ID %q", id)
		}
	}
}

func runOwnerTurn(t *testing.T, coordinator *pipeline.Coordinator) {
	t.Helper()
	speech := make([]byte, 640)
	speech[0], speech[1] = 0, 4
	frames := [][]byte{speech}
	for range 5 {
		frames = append(frames, make([]byte, 640))
	}
	for _, frame := range frames {
		if err := coordinator.SubmitPCM(frame); err != nil {
			t.Fatal(err)
		}
	}
	receiveOwnerValue(t, coordinator.TextResults())
	receiveOwnerValue(t, coordinator.TextResults())
	receiveOwnerValue(t, coordinator.SynthResults())
}

func receiveOwnerValue[T any](t *testing.T, values <-chan T) T {
	t.Helper()
	select {
	case value := <-values:
		return value
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for owner integration output")
		var zero T
		return zero
	}
}

func waitProxyCounts(t *testing.T, proxies *wsproxy.Set, active, closed int64) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		matched := true
		for _, counts := range proxies.Ledger().Connections {
			matched = matched && counts.Active == active && counts.Closed == closed
		}
		if matched {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("proxy counts did not reach active=%d closed=%d: %+v", active, closed, proxies.Ledger())
}

func closeProxies(t *testing.T, proxies *wsproxy.Set) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := proxies.Close(ctx); err != nil {
		t.Errorf("proxy Close() error = %v", err)
	}
}

func closeContracts(t *testing.T, contracts *pipelinecontract.Set) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := contracts.Close(ctx); err != nil {
		t.Errorf("contract Close() error = %v", err)
	}
}
