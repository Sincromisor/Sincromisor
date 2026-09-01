package synthdecode

import (
	"context"
	"errors"
	"testing"
	"time"
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
