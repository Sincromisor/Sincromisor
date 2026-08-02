//go:build gate3

package pipelinecontract

import (
	"context"
	"errors"
	"fmt"
	"net/http/httptest"
	"regexp"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/wsproxy"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func TestProxyFaultMatrixResetsProductionPipeline(t *testing.T) {
	for _, service := range serviceOrder {
		for _, action := range []wsproxy.Action{
			wsproxy.ActionClose,
			wsproxy.ActionMalformed,
			wsproxy.ActionHeldClose,
		} {
			t.Run(string(service)+"/"+string(action), func(t *testing.T) {
				runProxyScenario(t, service, action)
			})
		}
	}
}

func runProxyScenario(t *testing.T, faultService discovery.Service, action wsproxy.Action) {
	contracts := newContractSet(t)
	defer closeContractSet(t, contracts)
	proxies, err := wsproxy.NewSet(wsproxy.Config{
		Upstreams: contracts.Addresses(), ListenHost: "127.0.0.1",
	})
	if err != nil {
		t.Fatalf("NewSet() error = %v", err)
	}
	defer closeProxySet(t, proxies)
	t.Cleanup(func() {
		if t.Failed() {
			t.Logf("contract transcript = %+v; contract verify = %v; proxy ledger = %+v; proxy verify = %v",
				contracts.Transcript(), contracts.Verify(), proxies.Ledger(), proxies.VerifyConsumed())
		}
	})

	coordinator := newCoordinator(t, proxies.Addresses())
	registry := observability.NewRegistry()
	var panicCount atomic.Int64
	if err := coordinator.ConfigureRuntime(registry, func(string) { panicCount.Add(1) }); err != nil {
		t.Fatalf("ConfigureRuntime() error = %v", err)
	}
	if err := coordinator.Start(context.Background(), "gate3-proxy-session", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if generation := receive(t, coordinator.GenerationChanges()); generation != 1 {
		t.Fatalf("initial generation = %d, want 1", generation)
	}
	runTurn(t, coordinator)
	beforeConnections := proxies.Ledger().Connections
	beforeMetric := reconnectMetric(t, registry, faultService)
	if err := proxies.Arm([]wsproxy.Rule{{
		Service: faultService, Action: action, MatchOrdinal: 1, RejectReconnects: 1,
	}}); err != nil {
		t.Fatalf("Arm() error = %v", err)
	}
	if err := coordinator.SubmitPCM(make([]byte, 640)); err != nil {
		t.Fatalf("fault SubmitPCM() error = %v", err)
	}
	waitForUnavailable(t, coordinator)
	runRecoveryTurn(t, coordinator)
	afterConnections := proxies.Ledger().Connections
	assertConnectionMatrix(t, faultService, beforeConnections, afterConnections)
	afterMetric := reconnectMetric(t, registry, faultService)
	if afterMetric.start != beforeMetric.start+1 || afterMetric.success != beforeMetric.success+1 {
		t.Fatalf("reconnect metric = %v, want +1/+1 from %v", afterMetric, beforeMetric)
	}
	for _, service := range serviceOrder {
		if service == faultService {
			continue
		}
		if got := reconnectMetric(t, registry, service); got.start != 0 || got.success != 0 {
			t.Fatalf("unrelated %s reconnect metric changed: %v", service, got)
		}
	}
	if panicCount.Load() != 0 {
		t.Fatalf("panic callback count = %d, want 0", panicCount.Load())
	}
	if err := proxies.VerifyConsumed(); err != nil {
		t.Fatalf("VerifyConsumed() error = %v", err)
	}
	if err := contracts.Verify(); err != nil {
		t.Fatalf("contract Verify() error = %v", err)
	}
	assertScenarioTranscript(t, contracts.Transcript(), faultService)
	if err := coordinator.Close(); err != nil {
		t.Fatalf("coordinator Close() error = %v", err)
	}
	if action == wsproxy.ActionHeldClose {
		assertHeldCloseEmitsNoOldGenerationOutputThroughScenarioEnd(t, coordinator)
	}
	waitActiveZero(t, proxies)
}

func waitForUnavailable(t *testing.T, coordinator *pipeline.Coordinator) {
	t.Helper()
	if generation := receive(t, coordinator.GenerationChanges()); generation != 2 {
		t.Fatalf("reset generation = %d, want 2", generation)
	}
	if err := coordinator.SubmitPCM(make([]byte, 640)); !errors.Is(err, pipeline.ErrPipelineUnavailable) {
		t.Fatalf("SubmitPCM() during reset = %v, want ErrPipelineUnavailable", err)
	}
}

func runRecoveryTurn(t *testing.T, coordinator *pipeline.Coordinator) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for {
		err := coordinator.SubmitPCM(make([]byte, 640))
		if err == nil {
			break
		}
		if !errors.Is(err, pipeline.ErrPipelineUnavailable) || time.Now().After(deadline) {
			t.Fatalf("recovery SubmitPCM() error = %v", err)
		}
		time.Sleep(5 * time.Millisecond)
	}
	user := receive(t, coordinator.TextResults())
	assistant := receive(t, coordinator.TextResults())
	voice := receive(t, coordinator.SynthResults())
	if user.Generation != 2 || assistant.Generation != 2 || voice.Generation != 2 {
		t.Fatalf("recovery output generations = %d/%d/%d, want only generation 2",
			user.Generation, assistant.Generation, voice.Generation)
	}
}

func assertConnectionMatrix(
	t *testing.T,
	faultService discovery.Service,
	before, after map[discovery.Service]wsproxy.Counts,
) {
	t.Helper()
	faultIndex := 0
	for index, service := range serviceOrder {
		if service == faultService {
			faultIndex = index
		}
	}
	for index, service := range serviceOrder {
		wantDelta := int64(1)
		if index < faultIndex {
			wantDelta = 2
		}
		gotAccepted := after[service].Accepted - before[service].Accepted
		gotClosed := after[service].Closed - before[service].Closed
		if gotAccepted != wantDelta || gotClosed != wantDelta || after[service].Active != 1 {
			t.Errorf("%s counts delta accepted/closed/active = %d/%d/%d, want %d/%d/1",
				service, gotAccepted, gotClosed, after[service].Active, wantDelta, wantDelta)
		}
	}
}

func assertScenarioTranscript(t *testing.T, transcript Transcript, faultService discovery.Service) {
	t.Helper()
	wantPrefix := 0
	for index, service := range serviceOrder {
		if service == faultService {
			wantPrefix = index + 1
		}
	}
	if len(transcript.Entries) != 4+wantPrefix+4 {
		t.Fatalf("transcript length = %d, want %d", len(transcript.Entries), 8+wantPrefix)
	}
	baseline := transcript.Entries[:4]
	fault := transcript.Entries[4 : 4+wantPrefix]
	recovery := transcript.Entries[4+wantPrefix:]
	if baseline[0].SessionID != recovery[0].SessionID {
		t.Fatal("pipeline session changed across generations")
	}
	if fault[0].SpeechID != baseline[0].SpeechID+1 ||
		recovery[0].SpeechID != baseline[0].SpeechID+2 ||
		fault[0].SequenceID != baseline[0].SequenceID+1 ||
		recovery[0].SequenceID != baseline[0].SequenceID+2 {
		t.Fatal("extractor attempt identities are not strictly monotonic")
	}
	wantHistory := map[discovery.Service][2]int{
		discovery.ServiceExtractor:   {3, 4},
		discovery.ServiceRecognizer:  {3, 4},
		discovery.ServiceProcessor:   {4, 5},
		discovery.ServiceSynthesizer: {5, 6},
	}[faultService]
	if recovery[2].HistoryLength != wantHistory[0] || recovery[2].FinalHistorySize != wantHistory[1] {
		t.Fatalf("recovery history = %d/%d, want %d/%d",
			recovery[2].HistoryLength, recovery[2].FinalHistorySize, wantHistory[0], wantHistory[1])
	}
	if !baseline[3].ByteIdentical || !recovery[3].ByteIdentical {
		t.Fatal("normal turn processor bytes changed before synthesizer")
	}
}

type reconnectCounts struct{ start, success float64 }

func reconnectMetric(t *testing.T, registry *observability.Registry, service discovery.Service) reconnectCounts {
	t.Helper()
	response := httptest.NewRecorder()
	registry.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/metrics", nil))
	label := map[discovery.Service]string{
		discovery.ServiceExtractor: "extractor", discovery.ServiceRecognizer: "recognizer",
		discovery.ServiceProcessor: "processor", discovery.ServiceSynthesizer: "synthesizer",
	}[service]
	value := func(result string) float64 {
		pattern := regexp.MustCompile(fmt.Sprintf(
			`sincro_rtc_pipeline_reconnects_total\{result="%s",service="%s"\} ([0-9.e+-]+)`,
			result, label,
		))
		match := pattern.FindStringSubmatch(response.Body.String())
		if len(match) == 0 {
			return 0
		}
		number, _ := strconv.ParseFloat(match[1], 64)
		return number
	}
	return reconnectCounts{start: value("start"), success: value("success")}
}

func waitActiveZero(t *testing.T, proxies *wsproxy.Set) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		allZero := true
		for _, count := range proxies.Ledger().Connections {
			allZero = allZero && count.Active == 0
		}
		if allZero {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("proxy active connections did not reach zero")
}

// assertHeldCloseEmitsNoOldGenerationOutputThroughScenarioEnd は Close が全 producer を
// joinして結果channelを閉じた後まで検査し、保持・破棄した旧responseが遅延公開されないことを証明する。
func assertHeldCloseEmitsNoOldGenerationOutputThroughScenarioEnd(
	t *testing.T,
	coordinator *pipeline.Coordinator,
) {
	t.Helper()
	if remaining := len(coordinator.TextResults()); remaining != 0 {
		t.Fatalf("held-close left %d text outputs after scenario close", remaining)
	}
	if remaining := len(coordinator.SynthResults()); remaining != 0 {
		t.Fatalf("held-close left %d synthesizer outputs after scenario close", remaining)
	}
	if _, open := <-coordinator.TextResults(); open {
		t.Fatal("text output channel remained open after held-close scenario")
	}
	if _, open := <-coordinator.SynthResults(); open {
		t.Fatal("synthesizer output channel remained open after held-close scenario")
	}
}

func closeProxySet(t *testing.T, proxies *wsproxy.Set) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := proxies.Close(ctx); err != nil {
		t.Errorf("proxy Close() error = %v", err)
	}
}
