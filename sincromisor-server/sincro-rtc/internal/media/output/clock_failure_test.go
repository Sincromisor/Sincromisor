package output

import (
	"context"
	"errors"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
)

func TestOutputCodecAndTrackErrorsStopClockAndRejectPostCloseEnqueue(t *testing.T) {
	tests := []struct {
		name       string
		encoderErr error
		trackErr   error
	}{
		{name: "codec", encoderErr: errors.New("codec failed")},
		{name: "track", trackErr: errors.New("track failed")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			clock := newFakeOutputClock()
			encoder := &fakeOutputEncoder{err: test.encoderErr}
			track := newFakeOutputTrack()
			track.err = test.trackErr
			processor := newOutputWithFakes(t, encoder, track, clock, 0)
			done := runOutput(t, processor, context.Background())
			clock.waitTimer(t)
			clock.advance(FrameDuration)
			if err := <-done; err == nil {
				t.Fatal("Run() accepted injected output failure")
			}
			if !clock.timerStopped() {
				t.Fatal("Run did not stop timer after output failure")
			}
			if err := processor.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
			err := processor.Enqueue("late", synthdecode.DecodedSpeech{
				SpeechID: 9, PCM: make([]int16, frameSamples),
			})
			if !errors.Is(err, ErrOutputClosed) {
				t.Fatalf("post-close Enqueue() error = %v, want ErrOutputClosed", err)
			}
		})
	}
}
