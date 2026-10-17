package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"syscall"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

type retryLogFactory struct {
	fakeFactory
	calls int
}

func (f *retryLogFactory) Connect(ctx context.Context, session, mode string) (ClientSet, error) {
	f.calls++
	if f.calls == 1 {
		return nil, &pclient.ConnectError{Peer: pclient.ServiceSynthesizer, Operation: "dial", Err: syscall.ECONNREFUSED}
	}
	return f.fakeFactory.Connect(ctx, session, mode)
}

func TestConnectLogsRetryRecoveryAndCancellation(t *testing.T) {
	for _, cancelWait := range []bool{false, true} {
		t.Run(map[bool]string{false: "recovery", true: "cancel"}[cancelWait], func(t *testing.T) {
			var logs bytes.Buffer
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			factory := &retryLogFactory{fakeFactory: fakeFactory{t: t}}
			wait := func(ctx context.Context, delay time.Duration) <-chan error {
				if delay != 17*time.Millisecond {
					t.Errorf("delay = %v", delay)
				}
				result := make(chan error, 1)
				if cancelWait {
					cancel()
					result <- ctx.Err()
				} else {
					result <- nil
				}
				return result
			}
			c, err := newCoordinatorWithHooks(factory, slog.New(slog.NewJSONHandler(&logs, nil)), func(time.Duration) (time.Duration, error) { return 17 * time.Millisecond, nil }, wait)
			if err != nil {
				t.Fatal(err)
			}
			err = c.Start(ctx, "retry-session", "sincro")
			if (err != nil) != cancelWait {
				t.Fatalf("Start = %v", err)
			}
			_ = c.Close()
			var failure, result map[string]any
			for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
				var row map[string]any
				if err := json.Unmarshal([]byte(line), &row); err != nil {
					t.Fatal(err)
				}
				switch row["stage"] {
				case "pipeline_connect_failed":
					failure = row
				case "pipeline_connect_result":
					result = row
				}
			}
			if failure["peer"] != string(pclient.ServiceSynthesizer) || failure["connect_stage"] != "dial" || failure["reason"] != "connection_refused" || failure["attempt"] != float64(1) || failure["retry_delay_ms"] != float64(17) {
				t.Fatalf("failure = %v", failure)
			}
			wantOutcome, attempts := "success", float64(2)
			if cancelWait {
				wantOutcome, attempts = "cancelled", 1
			}
			if result["outcome"] != wantOutcome || result["attempt"] != attempts || result["initial"] != true || result["session_id"] != "retry-session" || result["generation"] != float64(1) || result["duration_ms"] == nil {
				t.Fatalf("result = %v", result)
			}
		})
	}
}
