package rtc

import (
	"sync"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

func TestTimeoutAndLastReadinessRaceStartsFactoryAtMostOnce(t *testing.T) {
	for attempt := range 30 {
		clock := &fakeClock{}
		factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
		_, session := newManagedLifecycleSession(t, clock, factory)
		if err := session.answerReady(); err != nil {
			t.Fatalf("attempt %d answerReady() error = %v", attempt, err)
		}
		session.transportReady()
		if !session.acceptAudioTrack(&webrtc.TrackRemote{}) {
			t.Fatalf("attempt %d audio was not accepted", attempt)
		}
		session.wg.Done()
		text := newSessionDataChannel(t, session, textChannelLabel)
		telop := newSessionDataChannel(t, session, telopChannelLabel)
		if !session.registerDataChannel(text) || !session.dataChannelOpened(text) ||
			!session.registerDataChannel(telop) {
			t.Fatalf("attempt %d readiness setup failed", attempt)
		}

		start := make(chan struct{})
		var racers sync.WaitGroup
		racers.Add(2)
		go func() {
			defer racers.Done()
			<-start
			clock.timer(1).fire()
		}()
		go func() {
			defer racers.Done()
			<-start
			session.dataChannelOpened(telop)
		}()
		close(start)
		racers.Wait()

		_ = session.Close("race_teardown")
		waitSessionDone(t, session)
		calls := 0
		for {
			select {
			case <-factory.calls:
				calls++
			default:
				if calls > 1 {
					t.Fatalf("attempt %d factory calls = %d, want at most 1", attempt, calls)
				}
				goto counted
			}
		}
	counted:
	}
}

func TestCloseDuringPipelineStartJoinsCoordinator(t *testing.T) {
	clock := &fakeClock{}
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
	_, session := newManagedLifecycleSession(t, clock, factory)
	if err := session.answerReady(); err != nil {
		t.Fatalf("answerReady() error = %v", err)
	}
	session.transportReady()
	if !session.acceptAudioTrack(&webrtc.TrackRemote{}) {
		t.Fatal("audio was not accepted")
	}
	session.wg.Done()
	text := newSessionDataChannel(t, session, textChannelLabel)
	telop := newSessionDataChannel(t, session, telopChannelLabel)
	if !session.registerDataChannel(text) || !session.dataChannelOpened(text) ||
		!session.registerDataChannel(telop) || !session.dataChannelOpened(telop) {
		t.Fatal("readiness setup failed")
	}
	select {
	case <-factory.calls:
	case <-time.After(time.Second):
		t.Fatal("pipeline Start did not reach factory")
	}
	if err := session.Close("close_during_pipeline_start"); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	waitSessionDone(t, session)
	assertSessionState(t, session, stateClosed)
	select {
	case call := <-factory.calls:
		t.Fatalf("factory retried after Close: %+v", call)
	default:
	}
}
