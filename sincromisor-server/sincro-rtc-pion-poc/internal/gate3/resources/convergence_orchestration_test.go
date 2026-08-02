package resources

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"
)

func TestCaptureBaselineUsesThreeTimedCollectorSamples(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	server := resourceServer(t, validMetrics(), validStatus())
	defer server.Close()
	config := Config{
		PID: 4242, ProcRoot: procRoot,
		MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}
	sampler, err := newSamplerWithTiming(
		config,
		server.Client(),
		samplerTiming{interval: 2 * time.Millisecond, timeout: 50 * time.Millisecond},
	)
	if err != nil {
		t.Fatal(err)
	}
	defaultSampler, err := NewSampler(config)
	if err != nil {
		t.Fatal(err)
	}
	if defaultSampler.interval != sampleInterval || defaultSampler.timeout != convergenceTimeout {
		t.Fatalf("NewSampler timing = %s/%s", defaultSampler.interval, defaultSampler.timeout)
	}
	baseline, samples, err := sampler.CaptureBaseline(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(samples) != baselineSampleCount || baseline.FDCount != 3 || baseline.Socket != 1 ||
		baseline.Goroutines != nil {
		t.Fatalf("CaptureBaseline() = (%+v, %+v)", baseline, samples)
	}
	if samples[1].At.Sub(samples[0].At) < time.Millisecond ||
		samples[2].At.Sub(samples[1].At) < time.Millisecond {
		t.Fatalf("baseline samples were not separated by interval: %+v", samples)
	}
}

func TestWaitForConvergenceRequiresThreeConsecutiveCollectorSamples(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	server := sequenceResourceServer(t, []int64{0, 0, 1, 0, 0, 0})
	defer server.Close()
	sampler, err := newSamplerWithTiming(Config{
		PID: 4242, ProcRoot: procRoot,
		MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}, server.Client(), samplerTiming{interval: 2 * time.Millisecond, timeout: 100 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	baseline := Baseline{FDCount: 3, Socket: 1}
	samples, err := sampler.WaitForConvergence(context.Background(), baseline)
	if err != nil {
		t.Fatal(err)
	}
	if len(samples) != 6 || samples[2].Queues.Input != 1 || !Converged(baseline, samples) {
		t.Fatalf("convergence samples = %+v", samples)
	}
	if Converged(baseline, samples[:5]) {
		t.Fatal("non-consecutive prefix converged")
	}
}

func TestWaitForConvergenceRejectsThresholdUntilInjectedTimeout(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	server := sequenceResourceServer(t, []int64{0})
	defer server.Close()
	sampler, err := newSamplerWithTiming(Config{
		PID: 4242, ProcRoot: procRoot,
		MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}, server.Client(), samplerTiming{interval: 2 * time.Millisecond, timeout: 12 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	// fixtureのFDCount=3はbaseline 0 + resourceHeadroom 2を1超える。
	samples, err := sampler.WaitForConvergence(context.Background(), Baseline{})
	if !errors.Is(err, context.DeadlineExceeded) || len(samples) == 0 {
		t.Fatalf("WaitForConvergence threshold timeout = (%+v, %v)", samples, err)
	}
}

func TestWaitForConvergenceHonorsEarlierCallerContext(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	server := sequenceResourceServer(t, []int64{1})
	defer server.Close()
	sampler, err := newSamplerWithTiming(Config{
		PID: 4242, ProcRoot: procRoot,
		MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}, server.Client(), samplerTiming{interval: 2 * time.Millisecond, timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Millisecond)
	defer cancel()
	samples, err := sampler.WaitForConvergence(ctx, Baseline{FDCount: 3, Socket: 1})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("WaitForConvergence caller timeout = (%+v, %v)", samples, err)
	}
}

func sequenceResourceServer(t *testing.T, inputDepths []int64) *httptest.Server {
	t.Helper()
	var mu sync.Mutex
	index := 0
	return httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/metrics":
			mu.Lock()
			depth := inputDepths[min(index, len(inputDepths)-1)]
			index++
			mu.Unlock()
			_, _ = writer.Write([]byte(
				"sincro_rtc_sessions_active 0\n" +
					`sincro_rtc_queue_depth{queue="input"} ` + strconv.FormatInt(depth, 10) + "\n",
			))
		case "/statuses":
			_, _ = writer.Write([]byte(validStatus()))
		default:
			http.NotFound(writer, request)
		}
	}))
}
