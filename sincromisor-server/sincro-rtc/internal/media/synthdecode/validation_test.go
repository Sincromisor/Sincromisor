package synthdecode

import (
	"context"
	"errors"
	"math"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestDecodeRejectsUnsupportedMIMEBeforeProcess(t *testing.T) {
	for _, audioFormat := range []string{
		"audio/mp3",
		"audio/wav;charset=utf-8",
		"audio/aac;codecs=aac",
		"audio/ogg;codecs=vorbis",
		"audio/ogg;codecs=opus;profile=x",
		"audio/ogg;codecs=opus;CODECS=opus",
		"not a mime",
	} {
		t.Run(audioFormat, func(t *testing.T) {
			runner := &fakeRunner{}
			_, err := newFakeDecoder(t, runner).Decode(context.Background(), validResult(audioFormat))
			assertDecodeKind(t, err, ErrorUnsupported)
			if runner.calls != 0 {
				t.Fatalf("runner calls = %d, want 0", runner.calls)
			}
		})
	}
}

func TestDecodeRejectsInputBoundariesBeforeProcess(t *testing.T) {
	oversize := make([]byte, maxEncodedBytes+1)
	tests := []struct {
		name string
		edit func(*protocol.SynthesizerResult)
		kind ErrorKind
	}{
		{name: "empty voice", edit: func(input *protocol.SynthesizerResult) { input.Voice = nil }, kind: ErrorInvalid},
		{name: "encoded limit", edit: func(input *protocol.SynthesizerResult) { input.Voice = oversize }, kind: ErrorLimit},
		{name: "negative speaking", edit: func(input *protocol.SynthesizerResult) { input.SpeakingTime = -1 }, kind: ErrorInvalid},
		{name: "nan speaking", edit: func(input *protocol.SynthesizerResult) { input.SpeakingTime = math.NaN() }, kind: ErrorInvalid},
		{name: "infinite speaking", edit: func(input *protocol.SynthesizerResult) { input.SpeakingTime = math.Inf(1) }, kind: ErrorInvalid},
		{name: "speaking limit", edit: func(input *protocol.SynthesizerResult) { input.SpeakingTime = 121 }, kind: ErrorLimit},
		{name: "negative mora", edit: func(input *protocol.SynthesizerResult) {
			input.MoraQueue = []protocol.SynthesizerMora{{Length: -1}}
		}, kind: ErrorInvalid},
		{name: "nan mora", edit: func(input *protocol.SynthesizerResult) {
			input.MoraQueue = []protocol.SynthesizerMora{{Length: math.NaN()}}
		}, kind: ErrorInvalid},
		{name: "infinite mora", edit: func(input *protocol.SynthesizerResult) {
			input.MoraQueue = []protocol.SynthesizerMora{{Length: math.Inf(1)}}
		}, kind: ErrorInvalid},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := validResult("audio/wav")
			test.edit(&input)
			runner := &fakeRunner{}
			_, err := newFakeDecoder(t, runner).Decode(context.Background(), input)
			assertDecodeKind(t, err, test.kind)
			if runner.calls != 0 {
				t.Fatalf("runner calls = %d, want validation before process", runner.calls)
			}
		})
	}
}

func TestDecodeInvalidReasons(t *testing.T) {
	text := "あ"
	tests := []struct {
		name   string
		runner *fakeRunner
		edit   func(*protocol.SynthesizerResult)
		want   string
	}{
		{name: "empty voice", runner: &fakeRunner{}, edit: func(input *protocol.SynthesizerResult) { input.Voice = nil }, want: "empty_voice"},
		{name: "input timing", runner: &fakeRunner{}, edit: func(input *protocol.SynthesizerResult) { input.SpeakingTime = math.NaN() }, want: "input_timing_invalid"},
		{name: "decoded PCM", runner: &fakeRunner{}, edit: func(*protocol.SynthesizerResult) {}, want: "decoded_pcm_invalid"},
		{name: "speaking time", runner: &fakeRunner{stdout: pcmBytes(1)}, edit: func(*protocol.SynthesizerResult) {}, want: "speaking_time_mismatch"},
		{name: "mora timing", runner: &fakeRunner{stdout: pcmBytes(4_800)}, edit: func(input *protocol.SynthesizerResult) {
			input.MoraQueue = []protocol.SynthesizerMora{{Text: &text, Length: 0.11}}
		}, want: "mora_timing_invalid"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := validResult("audio/wav")
			test.edit(&input)
			_, err := newFakeDecoder(t, test.runner).Decode(context.Background(), input)
			var decodeErr *DecodeError
			if !errors.As(err, &decodeErr) || decodeErr.Reason != test.want {
				t.Fatalf("DecodeError = %#v, want reason %q", decodeErr, test.want)
			}
		})
	}
}

func TestDecodeFormatErrorMatrixReturnsKindAndZeroResult(t *testing.T) {
	formats := []string{"audio/wav", "audio/aac", "audio/ogg", "audio/ogg;codecs=opus"}
	overEncoded := make([]byte, maxEncodedBytes+1)
	overDecoded := make([]byte, maxPCMBytes+1)
	for _, audioFormat := range formats {
		audioFormat := audioFormat
		t.Run(audioFormat, func(t *testing.T) {
			t.Parallel()
			tests := []struct {
				name   string
				kind   ErrorKind
				input  protocol.SynthesizerResult
				runner *fakeRunner
				cancel bool
			}{
				{
					name: "empty", kind: ErrorInvalid,
					input: func() protocol.SynthesizerResult {
						value := validResult(audioFormat)
						value.Voice = nil
						return value
					}(),
					runner: &fakeRunner{},
				},
				{
					name: "8 MiB plus 1", kind: ErrorLimit,
					input: func() protocol.SynthesizerResult {
						value := validResult(audioFormat)
						value.Voice = overEncoded
						return value
					}(),
					runner: &fakeRunner{},
				},
				{
					name: "over 120 seconds", kind: ErrorLimit,
					input:  validResult(audioFormat),
					runner: &fakeRunner{stdout: overDecoded},
				},
				{
					name: "five second timeout", kind: ErrorTimeout,
					input:  validResult(audioFormat),
					runner: &fakeRunner{waitForContext: true},
				},
				{
					name: "caller cancel", kind: ErrorProcess,
					input:  validResult(audioFormat),
					runner: &fakeRunner{waitForContext: true},
					cancel: true,
				},
			}
			for _, test := range tests {
				t.Run(test.name, func(t *testing.T) {
					ctx := context.Background()
					if test.cancel {
						cancelCtx, cancel := context.WithCancel(ctx)
						cancel()
						ctx = cancelCtx
					}
					result, err := newFakeDecoder(t, test.runner).Decode(ctx, test.input)
					assertDecodeKind(t, err, test.kind)
					assertZeroDecodedSpeech(t, result)
				})
			}
		})
	}
}
