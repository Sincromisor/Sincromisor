package client

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func TestConnectionWorkerStagesRecoverAsTerminalPanic(t *testing.T) {
	for _, test := range []struct {
		stage   string
		counted bool
	}{
		{stage: "read", counted: true},
		{stage: "finalize", counted: false},
	} {
		t.Run(test.stage, func(t *testing.T) {
			_, cancel := context.WithCancel(context.Background())
			client := &baseClient{
				service: ServiceExtractor,
				state:   stateOpen,
				cancel:  cancel,
				events:  make(chan Event, 1),
			}
			if test.counted {
				client.wg.Add(1)
			}
			client.goWorker(test.stage, test.counted, func() {
				panic("payload-chat-marker")
			})
			select {
			case event := <-client.events:
				var logs bytes.Buffer
				slog.New(slog.NewJSONHandler(&logs, nil)).Error("terminal", event.DiagnosticAttrs()...)
				var row map[string]any
				if err := json.Unmarshal(logs.Bytes(), &row); err != nil {
					t.Fatal(err)
				}
				if row["reason"] != "panic" || row["operation"] != test.stage {
					t.Fatal(row)
				}
				found := false
				for _, value := range row["panic_frames"].([]any) {
					frame := value.(map[string]any)
					if frame["file"] == "panic_boundary_test.go" && strings.Contains(frame["function"].(string), "TestConnectionWorkerStagesRecoverAsTerminalPanic") && frame["line"].(float64) > 0 {
						found = true
					}
					if strings.Contains(frame["file"].(string), "/") {
						t.Fatal(frame)
					}
				}
				if !found || strings.Contains(logs.String(), "payload-chat-marker") {
					t.Fatal(logs.String())
				}
				client.terminal("again", EventPanic, event.Err)
				if len(client.events) != 0 {
					t.Fatal("duplicate terminal event")
				}
				if event.Kind != EventPanic || event.Service != ServiceExtractor {
					t.Fatalf("panic event = %+v", event)
				}
			case <-time.After(time.Second):
				t.Fatal("worker panic did not reach terminal event")
			}
			if test.counted {
				client.wg.Wait()
			}
		})
	}
}
