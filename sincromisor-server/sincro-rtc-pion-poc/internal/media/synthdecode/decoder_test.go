package synthdecode

import (
	"context"
	"encoding/binary"
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

func TestNewDecoderRejectsInvalidDependencies(t *testing.T) {
	if _, err := NewDecoder("", &fakeRunner{}); err == nil {
		t.Fatal("NewDecoder() accepted empty path")
	}
	if _, err := NewDecoder("/test/ffmpeg", nil); err == nil {
		t.Fatal("NewDecoder() accepted nil runner")
	}
}

func TestDecodeNormalizesMIMEAndProducesPCM(t *testing.T) {
	for _, audioFormat := range []string{
		"audio/wav",
		"AUDIO/AAC",
		" audio/ogg ",
		`Audio/Ogg ; CoDeCs = "OpUs"`,
	} {
		t.Run(audioFormat, func(t *testing.T) {
			runner := &fakeRunner{stdout: pcmBytes(4_800)}
			decoder := newFakeDecoder(t, runner)
			result, err := decoder.Decode(context.Background(), validResult(audioFormat))
			if err != nil {
				t.Fatalf("Decode() error = %v", err)
			}
			if result.SpeechID != 42 || len(result.PCM) != 4_800 {
				t.Fatalf("DecodedSpeech = id %d, samples %d; want 42/4800", result.SpeechID, len(result.PCM))
			}
			if runner.calls != 1 || runner.executable != "/test/ffmpeg" {
				t.Fatalf("runner calls/path = %d/%q, want 1//test/ffmpeg", runner.calls, runner.executable)
			}
			if !containsAdjacent(runner.args, "-ac", "1") ||
				!containsAdjacent(runner.args, "-ar", "48000") ||
				!containsAdjacent(runner.args, "-f", "s16le") {
				t.Fatalf("ffmpeg args = %q, want mono 48 kHz s16le output", runner.args)
			}
		})
	}
}

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

func TestDecodeRejectsProcessAndOutputFailuresWithoutPartialResult(t *testing.T) {
	tests := []struct {
		name   string
		runner *fakeRunner
		kind   ErrorKind
	}{
		{name: "process failure", runner: &fakeRunner{stdout: pcmBytes(100), exitCode: 1, err: errors.New("bad container")}, kind: ErrorProcess},
		{name: "empty decoded audio", runner: &fakeRunner{}, kind: ErrorInvalid},
		{name: "partial sample", runner: &fakeRunner{stdout: []byte{1}}, kind: ErrorInvalid},
		{name: "decoded limit", runner: &fakeRunner{stdout: make([]byte, maxPCMBytes+1)}, kind: ErrorLimit},
		{name: "stderr limit", runner: &fakeRunner{stdout: pcmBytes(4_800), stderr: make([]byte, maxStderrBytes+1)}, kind: ErrorProcess},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := newFakeDecoder(t, test.runner).Decode(context.Background(), validResult("audio/wav"))
			assertDecodeKind(t, err, test.kind)
			if result.PCM != nil || result.Mora != nil || result.SpeechID != 0 {
				t.Fatalf("Decode() partial result = %#v, want zero value", result)
			}
		})
	}
}

func TestDecodeClassifiesTimeoutAndCallerCancellation(t *testing.T) {
	t.Run("decoder timeout", func(t *testing.T) {
		runner := &fakeRunner{waitForContext: true}
		_, err := newFakeDecoder(t, runner).Decode(context.Background(), validResult("audio/wav"))
		assertDecodeKind(t, err, ErrorTimeout)
	})
	t.Run("caller cancellation wins", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := newFakeDecoder(t, &fakeRunner{waitForContext: true}).Decode(ctx, validResult("audio/wav"))
		assertDecodeKind(t, err, ErrorProcess)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Decode() error = %v, want context.Canceled cause", err)
		}
	})
}

func TestDecodeMapsCumulativeMoraAndPreservesPointers(t *testing.T) {
	empty := ""
	vowel := "a"
	text := "あ"
	input := validResult("audio/wav")
	input.MoraQueue = []protocol.SynthesizerMora{
		{Vowel: nil, Text: &empty, Length: 0.000011},
		{Vowel: &vowel, Text: &text, Length: 0.000011},
		{Vowel: &empty, Text: nil, Length: 0},
	}
	result, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(4_800)}).Decode(context.Background(), input)
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	wantBounds := [][2]uint64{{0, 1}, {1, 1}, {1, 1}}
	for index, mora := range result.Mora {
		if mora.StartSample != wantBounds[index][0] || mora.EndSample != wantBounds[index][1] {
			t.Errorf("Mora[%d] bounds = %d..%d, want %d..%d",
				index, mora.StartSample, mora.EndSample, wantBounds[index][0], wantBounds[index][1])
		}
	}
	if result.Mora[0].Vowel != nil || result.Mora[0].Text == nil || *result.Mora[0].Text != "" ||
		result.Mora[2].Vowel == nil || *result.Mora[2].Vowel != "" || result.Mora[2].Text != nil {
		t.Fatalf("Mora nil/empty values were not preserved: %#v", result.Mora)
	}
}

func TestDecodeAcceptsEmptyAndShortMoraQueue(t *testing.T) {
	for _, queue := range [][]protocol.SynthesizerMora{
		{},
		{{Length: 0.05}},
		{{Length: 0.1}},
	} {
		input := validResult("audio/wav")
		input.MoraQueue = queue
		if _, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(4_800)}).Decode(context.Background(), input); err != nil {
			t.Fatalf("Decode(queue=%v) error = %v", queue, err)
		}
	}
}

func TestDecodeClampsTerminalSilentMoraToPCM(t *testing.T) {
	input := validResult("audio/wav")
	input.SpeakingTime = 65_024.0 / outputSampleRate
	input.MoraQueue = []protocol.SynthesizerMora{
		{Length: 64_000.0 / outputSampleRate},
		{Length: 2_071.0 / outputSampleRate},
	}
	result, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(65_024)}).Decode(context.Background(), input)
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	for index, mora := range result.Mora {
		if mora.StartSample > mora.EndSample || mora.EndSample > uint64(len(result.PCM)) {
			t.Fatalf("Mora[%d] bounds = %d..%d, PCM samples = %d", index, mora.StartSample, mora.EndSample, len(result.PCM))
		}
	}
	if got := result.Mora[len(result.Mora)-1].EndSample; got != 65_024 {
		t.Fatalf("terminal silent mora end = %d, want 65024", got)
	}
}

func TestDecodeRejectsMoraPastAudioAndSpeakingMismatch(t *testing.T) {
	text := "あ"
	for _, test := range []struct {
		name string
		mora []protocol.SynthesizerMora
	}{
		{name: "non-terminal mora past audio", mora: []protocol.SynthesizerMora{{Length: 0.10002}, {Length: 0}}},
		{name: "voiced terminal mora past audio", mora: []protocol.SynthesizerMora{{Text: &text, Length: 0.10002}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := validResult("audio/wav")
			input.MoraQueue = test.mora
			_, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(4_800)}).Decode(context.Background(), input)
			assertDecodeKind(t, err, ErrorInvalid)
		})
	}
	for _, test := range []struct {
		name    string
		samples int
	}{
		{name: "960 sample difference accepted", samples: 3_840},
		{name: "961 sample difference rejected", samples: 3_839},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := validResult("audio/wav")
			input.MoraQueue = nil
			_, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(test.samples)}).Decode(context.Background(), input)
			if test.samples == 3_840 {
				if err != nil {
					t.Fatalf("Decode() error = %v, want tolerance boundary accepted", err)
				}
				return
			}
			assertDecodeKind(t, err, ErrorInvalid)
		})
	}
}

func TestProbeVersion(t *testing.T) {
	for _, version := range []string{"6.1.0", "7.0.2", "8.9.1"} {
		t.Run("accept "+version, func(t *testing.T) {
			runner := &fakeRunner{stdout: []byte("ffmpeg version " + version + " Copyright\n")}
			decoder := newFakeDecoder(t, runner)
			if err := decoder.ProbeVersion(context.Background()); err != nil {
				t.Fatalf("ProbeVersion() error = %v", err)
			}
			if len(runner.args) != 1 || runner.args[0] != "-version" {
				t.Fatalf("probe args = %q, want [-version]", runner.args)
			}
		})
	}
	for _, version := range []string{"6.0.9", "5.1.0", "9.0.0", "unknown"} {
		t.Run("reject "+version, func(t *testing.T) {
			output := "ffmpeg version " + version + "\n"
			if err := newFakeDecoder(t, &fakeRunner{stdout: []byte(output)}).ProbeVersion(context.Background()); err == nil {
				t.Fatal("ProbeVersion() error = nil, want unsupported/parse error")
			}
		})
	}
}

func validResult(audioFormat string) protocol.SynthesizerResult {
	return protocol.SynthesizerResult{
		SpeechID: 42, Voice: []byte("encoded"), AudioFormat: audioFormat, SpeakingTime: 0.1,
	}
}

func newFakeDecoder(t *testing.T, runner *fakeRunner) *Decoder {
	t.Helper()
	decoder, err := NewDecoder("/test/ffmpeg", runner)
	if err != nil {
		t.Fatalf("NewDecoder() error = %v", err)
	}
	return decoder
}

func assertDecodeKind(t *testing.T, err error, want ErrorKind) {
	t.Helper()
	var decodeErr *DecodeError
	if !errors.As(err, &decodeErr) {
		t.Fatalf("error = %v, want *DecodeError", err)
	}
	if decodeErr.Kind != want {
		t.Fatalf("DecodeError.Kind = %q, want %q; error=%v", decodeErr.Kind, want, err)
	}
}

func assertZeroDecodedSpeech(t *testing.T, result DecodedSpeech) {
	t.Helper()
	if result.SpeechID != 0 || result.PCM != nil || result.Mora != nil {
		t.Fatalf("DecodedSpeech = %#v, want zero value on error", result)
	}
}

func pcmBytes(samples int) []byte {
	output := make([]byte, samples*2)
	for index := range samples {
		binary.LittleEndian.PutUint16(output[index*2:], uint16(int16(index%200-100)))
	}
	return output
}

func containsAdjacent(values []string, left string, right string) bool {
	return strings.Contains(strings.Join(values, "\x00"), left+"\x00"+right)
}

type fakeRunner struct {
	stdout         []byte
	stderr         []byte
	exitCode       int
	err            error
	waitForContext bool
	calls          int
	executable     string
	args           []string
}

func (r *fakeRunner) Run(
	ctx context.Context,
	executable string,
	_ []byte,
	_ int64,
	_ int64,
	args ...string,
) ([]byte, []byte, int, error) {
	r.calls++
	r.executable = executable
	r.args = append([]string(nil), args...)
	if r.waitForContext {
		<-ctx.Done()
		return nil, nil, -1, ctx.Err()
	}
	return r.stdout, r.stderr, r.exitCode, r.err
}

func TestDecodeTimeoutHasFiniteUpperBound(t *testing.T) {
	start := time.Now()
	_, err := newFakeDecoder(t, &fakeRunner{waitForContext: true}).Decode(
		context.Background(), validResult("audio/wav"),
	)
	assertDecodeKind(t, err, ErrorTimeout)
	if elapsed := time.Since(start); elapsed > decodeTimeout+time.Second {
		t.Fatalf("Decode() elapsed = %s, want <= %s", elapsed, decodeTimeout+time.Second)
	}
}
