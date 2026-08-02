package rtc

import (
	"context"
	"io"
	"log/slog"
	"testing"

	pionmedia "github.com/pion/webrtc/v4/pkg/media"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

func TestGenerationNotificationAlonePurgesAudioTextAndTelop(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	encoder, err := audiomedia.NewFrameEncoder()
	if err != nil {
		t.Fatalf("NewFrameEncoder() error = %v", err)
	}
	t.Cleanup(func() { _ = encoder.Close() })
	dispatcher, err := NewDataChannelDispatcher(context.Background(), logger, func(error) {})
	if err != nil {
		t.Fatalf("NewDataChannelDispatcher() error = %v", err)
	}
	t.Cleanup(func() { _ = dispatcher.Close() })
	output, err := audiomedia.NewOutputProcessor(encoder, rtcDiscardTrack{}, dispatcher.EnqueueTelop, logger)
	if err != nil {
		t.Fatalf("NewOutputProcessor() error = %v", err)
	}
	session := &Session{output: output, dispatcher: dispatcher}

	accepted, err := session.applyGenerationError(1, func() error {
		if err := output.Enqueue("old", synthdecode.DecodedSpeech{
			SpeechID: 1, PCM: make([]int16, audiomedia.SampleRate/50),
		}); err != nil {
			return err
		}
		if err := dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "old"}); err != nil {
			return err
		}
		return dispatcher.EnqueueTelop(audiomedia.TelopPayload{SpeechID: 1})
	})
	if !accepted || err != nil {
		t.Fatalf("generation 1 enqueue = %v, %v", accepted, err)
	}

	// No generation-2 text or synth envelope follows this notification. The notification
	// itself must therefore be sufficient to remove all generation-1 output.
	if !session.applyGeneration(2, nil) {
		t.Fatal("generation 2 notification was not applied")
	}
	if got := output.Stats().GenerationPurged; got != 1 {
		t.Fatalf("purged audio count = %d, want 1", got)
	}
	if len(dispatcher.textQueue) != 0 || len(dispatcher.telopQueue) != 0 {
		t.Fatalf("old data events remained = text %d telop %d",
			len(dispatcher.textQueue), len(dispatcher.telopQueue))
	}
	accepted, err = session.applyGenerationError(1, func() error {
		return dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "stale"})
	})
	if accepted || err != nil || len(dispatcher.textQueue) != 0 {
		t.Fatalf("stale envelope result = %v, %v, queue %d", accepted, err, len(dispatcher.textQueue))
	}
}

type rtcDiscardTrack struct{}

func (rtcDiscardTrack) WriteSample(pionmedia.Sample) error { return nil }
