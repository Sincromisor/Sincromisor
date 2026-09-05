package rtc

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc/datachannel"
)

func TestGenerationNotificationAlonePurgesAudioTextAndTelop(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	encoder, err := audiomedia.NewEncoder()
	if err != nil {
		t.Fatalf("NewEncoder() error = %v", err)
	}
	t.Cleanup(func() { _ = encoder.Close() })
	dispatcher, err := datachannel.New(context.Background(), logger, func(error) {})
	if err != nil {
		t.Fatalf("datachannel.New() error = %v", err)
	}
	t.Cleanup(func() { _ = dispatcher.Close() })
	output, err := audiomedia.New(encoder, rtcDiscardTrack{}, dispatcher.EnqueueTelop, logger)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	session := &Session{output: output, dispatcher: dispatcher}

	if accepted, err := session.applyGeneration(0, func() error {
		t.Fatal("zero generation ran its action")
		return nil
	}); accepted || err != nil {
		t.Fatalf("zero generation = %v, %v", accepted, err)
	}

	accepted, err := session.applyGeneration(1, func() error {
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
	if accepted, err := session.applyGeneration(1, nil); !accepted || err != nil || output.Stats().GenerationPurged != 0 {
		t.Fatalf("same generation notification = %v, %v, stats=%+v", accepted, err, output.Stats())
	}
	actionErr := errors.New("enqueue failed")
	if accepted, err := session.applyGeneration(1, func() error { return actionErr }); !accepted || !errors.Is(err, actionErr) {
		t.Fatalf("action failure = %v, %v", accepted, err)
	}

	// generation 2の後続出力がなくても、通知だけでgeneration 1の全出力を破棄する。
	if accepted, err := session.applyGeneration(2, nil); !accepted || err != nil {
		t.Fatal("generation 2 notification was not applied")
	}
	if got := output.Stats().GenerationPurged; got != 1 {
		t.Fatalf("purged audio count = %d, want 1", got)
	}
	dispatchStats := dispatcher.Stats()
	if dispatchStats.TextQueued != 0 || dispatchStats.TelopQueued != 0 {
		t.Fatalf("old data events remained = text %d telop %d",
			dispatchStats.TextQueued, dispatchStats.TelopQueued)
	}
	accepted, err = session.applyGeneration(1, func() error {
		return dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "stale"})
	})
	if accepted || err != nil || dispatcher.Stats().TextQueued != 0 {
		t.Fatalf("stale envelope result = %v, %v, queue %d", accepted, err, dispatcher.Stats().TextQueued)
	}
}

func TestSessionOutputCloseRejectsConcurrentTextSynthAndGenerationActions(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	encoder, err := audiomedia.NewEncoder()
	if err != nil {
		t.Fatalf("NewEncoder() error = %v", err)
	}
	defer func() { _ = encoder.Close() }()
	dispatcher, err := datachannel.New(context.Background(), logger, func(error) {})
	if err != nil {
		t.Fatalf("datachannel.New() error = %v", err)
	}
	output, err := audiomedia.New(encoder, rtcDiscardTrack{}, dispatcher.EnqueueTelop, logger)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	session := &Session{output: output, dispatcher: dispatcher}
	session.applyGeneration(1, nil)

	start := make(chan struct{})
	var workers sync.WaitGroup
	for index := 0; index < 50; index++ {
		workers.Add(3)
		go func(id int) {
			defer workers.Done()
			<-start
			_, _ = session.applyGeneration(1, func() error {
				return dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "late-text"})
			})
		}(index)
		go func(id int) {
			defer workers.Done()
			<-start
			_, _ = session.applyGeneration(1, func() error {
				return output.Enqueue("late-synth", synthdecode.DecodedSpeech{
					SpeechID: int64(id), PCM: make([]int16, audiomedia.SampleRate/50),
				})
			})
		}(index)
		go func(id int) {
			defer workers.Done()
			<-start
			session.applyGeneration(uint64(2+id), nil)
		}(index)
	}
	close(start)
	if err := output.Close(); err != nil {
		t.Fatalf("OutputProcessor.Close() error = %v", err)
	}
	if err := dispatcher.Close(); err != nil {
		t.Fatalf("Dispatcher.Close() error = %v", err)
	}
	workers.Wait()

	outputStats := output.Stats()
	if !outputStats.Closed || outputStats.QueuedSpeeches != 0 || outputStats.QueuedSamples != 0 {
		t.Fatalf("output after close = %+v", outputStats)
	}
	dispatchStats := dispatcher.Stats()
	if !dispatchStats.Closed || dispatchStats.TextQueued != 0 ||
		dispatchStats.TelopQueued != 0 || dispatchStats.ActiveWorkers != 0 {
		t.Fatalf("dispatcher after close = %+v", dispatchStats)
	}
	if err := output.Enqueue("post-close", synthdecode.DecodedSpeech{
		SpeechID: 99, PCM: make([]int16, audiomedia.SampleRate/50),
	}); !errors.Is(err, audiomedia.ErrOutputClosed) {
		t.Fatalf("post-close synth error = %v", err)
	}
	if err := dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "post-close"}); !errors.Is(err, datachannel.ErrDataChannelDispatcherClosed) {
		t.Fatalf("post-close text error = %v", err)
	}
}

func TestSynthDecodeCompletionAfterOutputCloseCannotRestoreQueuedAudio(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	encoder, err := audiomedia.NewEncoder()
	if err != nil {
		t.Fatalf("NewEncoder() error = %v", err)
	}
	defer func() { _ = encoder.Close() }()
	dispatcher, err := datachannel.New(context.Background(), logger, func(error) {})
	if err != nil {
		t.Fatalf("datachannel.New() error = %v", err)
	}
	defer func() { _ = dispatcher.Close() }()
	output, err := audiomedia.New(encoder, rtcDiscardTrack{}, dispatcher.EnqueueTelop, logger)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	decoder := newBlockingSynthDecoder()
	session := &Session{
		ctx: context.Background(), output: output, dispatcher: dispatcher,
		synthDecoder: decoder, logger: logger,
	}

	done := make(chan error, 1)
	go func() {
		done <- session.handleSynthOutput(pipeline.Output[protocol.SynthesizerResult]{
			Generation: 1,
			Value: protocol.SynthesizerResult{
				SpeechID: 7, Message: "decoded after close",
			},
		})
	}()
	<-decoder.entered
	if err := output.Close(); err != nil {
		t.Fatalf("OutputProcessor.Close() error = %v", err)
	}
	close(decoder.release)
	if err := <-done; err != nil {
		t.Fatalf("handleSynthOutput() error after close = %v", err)
	}
	if stats := output.Stats(); !stats.Closed || stats.QueuedSpeeches != 0 || stats.QueuedSamples != 0 {
		t.Fatalf("output after decode completion = %+v", stats)
	}
}
