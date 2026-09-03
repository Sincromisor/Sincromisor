package rtc

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"testing"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

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
