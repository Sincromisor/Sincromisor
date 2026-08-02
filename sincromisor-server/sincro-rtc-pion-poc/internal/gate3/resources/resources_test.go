package resources

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCollectorReadsProcMetricsAndStatus(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	server := resourceServer(t,
		"sincro_rtc_sessions_active 0\nsincro_rtc_queue_depth{queue=\"input\"} 2\n",
		`{"sessions":0,"session_limit":100,"ready":true,"draining":false}`,
	)
	defer server.Close()
	collector, err := newCollector(Config{
		PID: 4242, ProcRoot: procRoot, MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	collector.now = func() time.Time { return time.Unix(1, 0).UTC() }
	sample, err := collector.collect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if sample.FDCount != 3 || len(sample.SocketInodes) != 1 || sample.SocketInodes[0] != 91 ||
		sample.Goroutines != nil || sample.Queues.Input != 2 ||
		sample.Queues.Speech != 0 || sample.Queues.Text != 0 || sample.Queues.Telop != 0 {
		t.Fatalf("sample = %+v", sample)
	}
}

func TestCollectorRejectsMalformedOrPartialInputs(t *testing.T) {
	tests := []struct {
		name    string
		metrics string
		status  string
		mutate  func(*testing.T, string)
	}{
		{name: "malformed metrics", metrics: "sincro_rtc_sessions_active bad\n", status: validStatus()},
		{name: "missing sessions metric", metrics: "other 1\n", status: validStatus()},
		{name: "malformed status", metrics: validMetrics(), status: `{"sessions":"bad"}`},
		{
			name: "disappeared PID", metrics: validMetrics(), status: validStatus(),
			mutate: func(t *testing.T, root string) {
				t.Helper()
				if err := os.RemoveAll(filepath.Join(root, "4242")); err != nil {
					t.Fatal(err)
				}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			procRoot := makeProcFixture(t, 4242)
			if test.mutate != nil {
				test.mutate(t, procRoot)
			}
			server := resourceServer(t, test.metrics, test.status)
			defer server.Close()
			collector, err := newCollector(Config{
				PID: 4242, ProcRoot: procRoot,
				MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
			}, server.Client())
			if err != nil {
				t.Fatal(err)
			}
			if _, err := collector.collect(context.Background()); err == nil {
				t.Fatal("collect() succeeded")
			}
		})
	}
}

func TestSamplerDiscardsFailedRoundsAndStopsOnce(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	var mu sync.Mutex
	malformed := true
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mu.Lock()
		bad := malformed
		mu.Unlock()
		if request.URL.Path == "/metrics" {
			if bad {
				_, _ = writer.Write([]byte("sincro_rtc_sessions_active bad\n"))
			} else {
				_, _ = writer.Write([]byte(validMetrics()))
			}
			return
		}
		_, _ = writer.Write([]byte(validStatus()))
	}))
	defer server.Close()
	sampler, err := newSampler(Config{
		PID: 4242, ProcRoot: procRoot,
		MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}, server.Client(), 5*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if err := sampler.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := sampler.Start(context.Background()); !errors.Is(err, ErrAlreadyStarted) {
		t.Fatalf("second Start error = %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	mu.Lock()
	malformed = false
	mu.Unlock()
	time.Sleep(20 * time.Millisecond)
	result, err := sampler.Stop()
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) == 0 || len(result.Samples) == 0 {
		t.Fatalf("result = %+v", result)
	}
	if err := sampler.Start(context.Background()); !errors.Is(err, ErrStopped) {
		t.Fatalf("Start after Stop error = %v", err)
	}
	again, err := sampler.Stop()
	if err != nil || len(again.Samples) != len(result.Samples) {
		t.Fatalf("second Stop = (%+v, %v)", again, err)
	}
}

func TestSamplerReportsParentDeadlineAfterJoiningWorker(t *testing.T) {
	procRoot := makeProcFixture(t, 4242)
	server := resourceServer(t, validMetrics(), validStatus())
	defer server.Close()
	sampler, err := newSampler(Config{
		PID: 4242, ProcRoot: procRoot,
		MetricsURL: server.URL + "/metrics", StatusURL: server.URL + "/statuses",
	}, server.Client(), 5*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if err := sampler.Start(ctx); err != nil {
		t.Fatal(err)
	}
	<-ctx.Done()
	if _, err := sampler.Stop(); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Stop after parent deadline error = %v", err)
	}
}

func TestBaselineAndThreeConsecutiveConvergence(t *testing.T) {
	goroutines := 10
	baseline, err := BaselineFrom([]Sample{
		{Ready: true, FDCount: 4, SocketInodes: []uint64{1}, Goroutines: &goroutines},
		{Ready: true, FDCount: 6, SocketInodes: []uint64{1, 2}, Goroutines: intPointer(12)},
		{Ready: true, FDCount: 5, SocketInodes: []uint64{1}, Goroutines: intPointer(11)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if baseline.FDCount != 6 || baseline.Socket != 2 || baseline.Goroutines == nil || *baseline.Goroutines != 12 {
		t.Fatalf("baseline = %+v", baseline)
	}
	good := Sample{FDCount: 8, SocketInodes: []uint64{1, 2, 3, 4}, Goroutines: intPointer(17)}
	if Converged(baseline, []Sample{good, good}) {
		t.Fatal("two samples converged")
	}
	if !Converged(baseline, []Sample{good, good, good}) {
		t.Fatal("three stable samples did not converge")
	}
	badQueue := good
	badQueue.Queues.Text = 1
	if Converged(baseline, []Sample{good, badQueue, good, good}) {
		t.Fatal("non-consecutive stable samples converged")
	}
	badGoroutine := good
	badGoroutine.Goroutines = intPointer(18)
	if Converged(baseline, []Sample{good, good, badGoroutine}) {
		t.Fatal("goroutine threshold violation converged")
	}
}

func TestChildProcessModeRequiresNullGoroutines(t *testing.T) {
	baseline, err := BaselineFrom([]Sample{
		{Ready: true}, {Ready: true}, {Ready: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if baseline.Goroutines != nil {
		t.Fatalf("child baseline goroutines = %v", baseline.Goroutines)
	}
	good := Sample{}
	if !Converged(baseline, []Sample{good, good, good}) {
		t.Fatal("child process samples with null goroutines did not converge")
	}
	good.Goroutines = intPointer(1)
	if Converged(baseline, []Sample{good, good, good}) {
		t.Fatal("child process samples substituted test goroutines")
	}
}

func TestRealLinuxProcfsAndResultJSONContract(t *testing.T) {
	if _, _, err := collectProc("/proc", os.Getpid()); err != nil {
		t.Fatalf("collect real procfs: %v", err)
	}
	result := Result{Samples: []Sample{{At: time.Now().UTC(), PID: os.Getpid(), Queues: Queues{}}}}
	path := filepath.Join(t.TempDir(), "samples.json")
	if err := result.WriteJSON(path); err != nil {
		t.Fatal(err)
	}
	if err := result.WriteJSON(path); err == nil {
		t.Fatal("WriteJSON overwrote existing target")
	}
}

func makeProcFixture(t *testing.T, pid int) string {
	t.Helper()
	root := t.TempDir()
	fdDir := filepath.Join(root, strconv.Itoa(pid), "fd")
	if err := os.MkdirAll(fdDir, 0o700); err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]string{
		"0": "/dev/null", "1": "socket:[91]", "2": "socket:[91]",
	} {
		if err := os.Symlink(target, filepath.Join(fdDir, name)); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func resourceServer(t *testing.T, metrics, status string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/metrics":
			_, _ = writer.Write([]byte(metrics))
		case "/statuses":
			_, _ = writer.Write([]byte(status))
		default:
			http.NotFound(writer, request)
		}
	}))
}

func validMetrics() string {
	return strings.Join([]string{
		"sincro_rtc_sessions_active 0",
		`sincro_rtc_queue_depth{queue="input"} 0`,
		` sincro_rtc_queue_depth{queue="speech"} 0`,
		` sincro_rtc_queue_depth{queue="text"} 0`,
		` sincro_rtc_queue_depth{queue="telop"} 0`,
	}, "\n") + "\n"
}

func validStatus() string {
	return `{"sessions":0,"session_limit":100,"ready":true,"draining":false}`
}

func intPointer(value int) *int {
	return &value
}
