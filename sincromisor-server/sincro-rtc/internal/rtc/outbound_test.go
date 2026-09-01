package rtc

import (
	"context"
	"errors"
	"fmt"
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

	// generation 2の後続出力がなくても、通知だけでgeneration 1の全出力を破棄する。
	if !session.applyGeneration(2, nil) {
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
	accepted, err = session.applyGenerationError(1, func() error {
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
			_, _ = session.applyGenerationError(1, func() error {
				return dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "late-text"})
			})
		}(index)
		go func(id int) {
			defer workers.Done()
			<-start
			_, _ = session.applyGenerationError(1, func() error {
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

func TestHandleSynthOutputQueuesClampedTerminalSilentMora(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	encoder, err := audiomedia.NewEncoder()
	if err != nil {
		t.Fatalf("NewEncoder() error = %v", err)
	}
	t.Cleanup(func() { _ = encoder.Close() })
	output, err := audiomedia.New(encoder, rtcDiscardTrack{}, nil, logger)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() { _ = output.Close() })
	decoder, err := synthdecode.NewDecoder("/test/ffmpeg", outboundPCMRunner{samples: 65_024})
	if err != nil {
		t.Fatalf("NewDecoder() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	lifecycle, err := newSessionLifecycle(SystemClock{})
	if err != nil {
		t.Fatalf("newSessionLifecycle() error = %v", err)
	}
	session := &Session{
		id: "clamped-mora", ctx: ctx, cancel: cancel, lifecycle: lifecycle, done: make(chan struct{}),
		output: output, synthDecoder: decoder, logger: logger, onClosed: func(string) {}, outboundGeneration: 1,
	}
	input := protocol.SynthesizerResult{
		SpeechID: 1, Message: "clamped", Voice: []byte("encoded"), AudioFormat: "audio/wav",
		SpeakingTime: 65_024.0 / audiomedia.SampleRate,
		MoraQueue: []protocol.SynthesizerMora{
			{Length: 64_000.0 / audiomedia.SampleRate},
			{Length: 2_071.0 / audiomedia.SampleRate},
		},
	}
	if err := session.handleSynthOutput(pipeline.Output[protocol.SynthesizerResult]{Generation: 1, Value: input}); err != nil {
		t.Fatalf("handleSynthOutput() error = %v", err)
	}
	if ctx.Err() != nil {
		t.Fatal("session closed with codec_error")
	}
	if stats := output.Stats(); stats.QueuedSpeeches != 1 || stats.QueuedSamples != 65_024 {
		t.Fatalf("output stats = %+v, want one 65024-sample speech", stats)
	}
}

func TestHandleSynthOutputLogsDecodeErrorKindAndClosesSession(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		kind   string
		reason string
	}{
		{
			name:   "classified",
			err:    fmt.Errorf("decode result: %w", &synthdecode.DecodeError{Kind: synthdecode.ErrorProcess, Reason: "empty_voice", Cause: errors.New("ffmpeg stderr: secret")}),
			kind:   "process",
			reason: "unknown",
		},
		{name: "empty voice", err: &synthdecode.DecodeError{Kind: synthdecode.ErrorInvalid, Reason: "empty_voice"}, kind: "invalid", reason: "empty_voice"},
		{name: "decoded PCM", err: &synthdecode.DecodeError{Kind: synthdecode.ErrorInvalid, Reason: "decoded_pcm_invalid"}, kind: "invalid", reason: "decoded_pcm_invalid"},
		{name: "speaking time", err: &synthdecode.DecodeError{Kind: synthdecode.ErrorInvalid, Reason: "speaking_time_mismatch"}, kind: "invalid", reason: "speaking_time_mismatch"},
		{name: "mora timing", err: &synthdecode.DecodeError{Kind: synthdecode.ErrorInvalid, Reason: "mora_timing_invalid"}, kind: "invalid", reason: "mora_timing_invalid"},
		{name: "input timing", err: &synthdecode.DecodeError{Kind: synthdecode.ErrorInvalid, Reason: "input_timing_invalid"}, kind: "invalid", reason: "input_timing_invalid"},
		{name: "unknown", err: errors.New("voice bytes and response text must not be logged"), kind: "unknown", reason: "unknown"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			logs := &outboundCaptureHandler{}
			ctx, cancel := context.WithCancel(context.Background())
			lifecycle, err := newSessionLifecycle(SystemClock{})
			if err != nil {
				t.Fatalf("newSessionLifecycle() error = %v", err)
			}
			session := &Session{
				id: "decode-session", ctx: ctx, cancel: cancel, lifecycle: lifecycle,
				done: make(chan struct{}), logger: slog.New(logs),
				synthDecoder: outboundErrorSynthDecoder{err: test.err}, onClosed: func(string) {}, outboundGeneration: 1,
			}
			if err := session.handleSynthOutput(pipeline.Output[protocol.SynthesizerResult]{
				Generation: 1,
				Value: protocol.SynthesizerResult{
					Message: "private response text",
					Voice:   []byte("private voice payload"),
				},
			}); err != nil {
				t.Fatalf("handleSynthOutput() error = %v", err)
			}
			waitSessionDone(t, session)

			record := logs.records[0]
			if record.message != "synthesized audio decode failed" {
				t.Fatalf("log message = %q", record.message)
			}
			want := map[string]any{"session_id": "decode-session", "reason": "codec_error", "codec_error_kind": test.kind, "codec_error_reason": test.reason}
			if !equalOutboundAttrs(record.attrs, want) {
				t.Fatalf("log attrs = %#v, want %#v", record.attrs, want)
			}
			for _, value := range record.attrs {
				if value == test.err.Error() {
					t.Fatal("decoder error was logged")
				}
			}
		})
	}
}

type outboundErrorSynthDecoder struct{ err error }

func (d outboundErrorSynthDecoder) Decode(context.Context, protocol.SynthesizerResult) (synthdecode.DecodedSpeech, error) {
	return synthdecode.DecodedSpeech{}, d.err
}

type outboundPCMRunner struct{ samples int }

func (r outboundPCMRunner) Run(
	context.Context,
	string,
	[]byte,
	int64,
	int64,
	...string,
) ([]byte, []byte, int, error) {
	return make([]byte, r.samples*2), nil, 0, nil
}

type outboundCapturedRecord struct {
	message string
	attrs   map[string]any
}

type outboundCaptureHandler struct{ records []outboundCapturedRecord }

func (h *outboundCaptureHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *outboundCaptureHandler) Handle(_ context.Context, record slog.Record) error {
	attrs := make(map[string]any, record.NumAttrs())
	record.Attrs(func(attr slog.Attr) bool {
		attrs[attr.Key] = attr.Value.Any()
		return true
	})
	h.records = append(h.records, outboundCapturedRecord{message: record.Message, attrs: attrs})
	return nil
}

func (h *outboundCaptureHandler) WithAttrs([]slog.Attr) slog.Handler { return h }

func (h *outboundCaptureHandler) WithGroup(string) slog.Handler { return h }

func equalOutboundAttrs(got, want map[string]any) bool {
	if len(got) != len(want) {
		return false
	}
	for key, wantValue := range want {
		if got[key] != wantValue {
			return false
		}
	}
	return true
}

type blockingSynthDecoder struct {
	entered chan struct{}
	release chan struct{}
}

func newBlockingSynthDecoder() *blockingSynthDecoder {
	return &blockingSynthDecoder{entered: make(chan struct{}), release: make(chan struct{})}
}

func (d *blockingSynthDecoder) Decode(
	context.Context,
	protocol.SynthesizerResult,
) (synthdecode.DecodedSpeech, error) {
	close(d.entered)
	<-d.release
	return synthdecode.DecodedSpeech{
		SpeechID: 7,
		PCM:      make([]int16, audiomedia.SampleRate/50),
	}, nil
}

type rtcDiscardTrack struct{}

func (rtcDiscardTrack) WriteSample(audiomedia.Sample) error { return nil }
