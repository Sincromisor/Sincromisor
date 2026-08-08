package client

import (
	"context"
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
