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
			clock := &fakeClock{}
			factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
			_, session := newManagedLifecycleSession(t, clock, factory)
			if err := session.answerReady(); err != nil {
				t.Fatalf("answerReady() error = %v", err)
			}
			session.transportReady()
			track := &webrtc.TrackRemote{}
			text := newSessionDataChannel(t, session, textChannelLabel)
			telop := newSessionDataChannel(t, session, telopChannelLabel)
			for index, event := range order {
				switch event {
				case "audio":
					if !session.acceptAudioTrack(track) {
						t.Fatal("first audio track was not accepted")
					}
					// OnTrack starts the reserved decoder goroutine; this helper test
					// completes that reservation without reading a synthetic TrackRemote.
					session.wg.Done()
				case "text":
					if !session.registerDataChannel(text) || !session.dataChannelOpened(text) {
						t.Fatal("first text channel/open was not accepted")
					}
				case "telop":
					if !session.registerDataChannel(telop) || !session.dataChannelOpened(telop) {
						t.Fatal("first telop channel/open was not accepted")
					}
				}
				if index != len(order)-1 {
					select {
					case call := <-factory.calls:
						t.Fatalf("pipeline started before final readiness: %+v", call)
					default:
					}
				}
			}
			select {
			case call := <-factory.calls:
				if call.sessionID != session.id {
					t.Fatalf("pipeline session = %s, want %s", call.sessionID, session.id)
				}
			case <-time.After(time.Second):
				t.Fatal("pipeline did not start after final readiness")
			}
			_ = session.Close("test_complete")
			waitSessionDone(t, session)
			select {
			case call := <-factory.calls:
				t.Fatalf("pipeline started more than once: %+v", call)
			default:
			}
		})
	}
}

func TestMediaLatchesBeforeConnectedStartPipelineAfterTransport(t *testing.T) {
	clock := &fakeClock{}
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
	_, session := newManagedLifecycleSession(t, clock, factory)
	if err := session.answerReady(); err != nil {
		t.Fatalf("answerReady() error = %v", err)
	}
	track := &webrtc.TrackRemote{}
	if !session.acceptAudioTrack(track) {
		t.Fatal("audio before connected was not accepted")
	}
	session.wg.Done()
	text := newSessionDataChannel(t, session, textChannelLabel)
	telop := newSessionDataChannel(t, session, telopChannelLabel)
	if !session.registerDataChannel(text) || !session.dataChannelOpened(text) ||
		!session.registerDataChannel(telop) || !session.dataChannelOpened(telop) {
		t.Fatal("data channel before connected was not accepted")
	}
	assertNoPipelineCall(t, factory)
	session.transportReady()
	select {
	case <-factory.calls:
	case <-time.After(time.Second):
		t.Fatal("connected did not promote pre-recorded media readiness")
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
