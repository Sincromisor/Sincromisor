package rtc

import (
	"context"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

func TestMediaReadinessAllSixOrdersPromoteExactlyOnce(t *testing.T) {
	permutations := [][]string{
		{"audio", "text", "telop"},
		{"audio", "telop", "text"},
		{"text", "audio", "telop"},
		{"text", "telop", "audio"},
		{"telop", "audio", "text"},
		{"telop", "text", "audio"},
	}
	for _, order := range permutations {
		t.Run(order[0]+"_"+order[1]+"_"+order[2], func(t *testing.T) {
			session := &Session{
				lifecycle: &sessionLifecycle{
					state:     stateTransportReady,
					deadlines: &deadlineController{clock: &fakeClock{}},
				},
			}
			promotions := 0
			for index, event := range order {
				switch event {
				case "audio":
					session.lifecycle.audio = &webrtc.TrackRemote{}
				case "text":
					session.lifecycle.textChannel = &webrtc.DataChannel{}
					session.lifecycle.textOpen = true
				case "telop":
					session.lifecycle.telopChannel = &webrtc.DataChannel{}
					session.lifecycle.telopOpen = true
				}
				if session.promoteMediaReadyLocked(event) {
					promotions++
					session.wg.Done()
					if index != len(order)-1 {
						t.Fatalf("media_ready promoted before final event at index %d", index)
					}
				}
			}
			if promotions != 1 || session.lifecycle.state != stateMediaReady {
				t.Fatalf("promotions/state = %d/%s, want 1/media_ready", promotions, session.lifecycle.state)
			}
			if session.promoteMediaReadyLocked("duplicate") {
				t.Fatal("duplicate readiness promoted a second pipeline start")
			}
		})
	}
}

func TestMediaReadinessStartsPipelineOnceAndPreservesTalkMode(t *testing.T) {
	for _, talkMode := range []string{"chat", "sincro"} {
		t.Run(talkMode, func(t *testing.T) {
			factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
			coordinator, err := pipeline.NewCoordinator(factory, testLogger())
			if err != nil {
				t.Fatalf("NewCoordinator() error = %v", err)
			}
			ctx, cancel := context.WithCancel(context.Background())
			session := &Session{
				id:       "readiness-session",
				talkMode: talkMode,
				pipeline: coordinator,
				logger:   testLogger(),
				ctx:      ctx,
				cancel:   cancel,
				lifecycle: &sessionLifecycle{
					state:        stateTransportReady,
					deadlines:    &deadlineController{clock: &fakeClock{}},
					audio:        &webrtc.TrackRemote{},
					textChannel:  &webrtc.DataChannel{},
					telopChannel: &webrtc.DataChannel{},
					textOpen:     true,
					telopOpen:    true,
				},
			}
			session.lifecycle.mu.Lock()
			start := session.promoteMediaReadyLocked("last_latch")
			session.lifecycle.mu.Unlock()
			if !start {
				t.Fatal("complete readiness did not reserve pipeline")
			}
			session.launchPipeline()
			select {
			case call := <-factory.calls:
				if call.sessionID != session.id || call.talkMode != talkMode {
					t.Fatalf("pipeline Start args = %+v, want session=%s talk_mode=%s", call, session.id, talkMode)
				}
			case <-time.After(time.Second):
				t.Fatal("pipeline factory was not called")
			}
			session.lifecycle.mu.Lock()
			if session.promoteMediaReadyLocked("duplicate") {
				t.Error("duplicate callback reserved a second pipeline")
			}
			session.lifecycle.state = stateClosing
			session.lifecycle.mu.Unlock()
			cancel()
			if err := coordinator.Close(); err != nil {
				t.Fatalf("Coordinator.Close() error = %v", err)
			}
			session.wg.Wait()
			select {
			case call := <-factory.calls:
				t.Fatalf("pipeline factory called more than once: %+v", call)
			default:
			}
		})
	}
}

type pipelineStart struct {
	sessionID string
	talkMode  string
}

type recordingBlockingFactory struct {
	calls chan pipelineStart
}

func (f *recordingBlockingFactory) Connect(
	ctx context.Context,
	sessionID string,
	talkMode string,
) (pipeline.ClientSet, error) {
	f.calls <- pipelineStart{sessionID: sessionID, talkMode: talkMode}
	<-ctx.Done()
	return nil, ctx.Err()
}
