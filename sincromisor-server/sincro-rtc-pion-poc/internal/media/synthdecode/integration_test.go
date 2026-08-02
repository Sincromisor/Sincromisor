package synthdecode

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

func TestFFmpegDecodesSupportedFixtures(t *testing.T) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("system ffmpeg is unavailable")
	}
	decoder, err := NewDecoder(ffmpegPath, ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name         string
		file         string
		audioFormat  string
		samples      int
		speakingTime float64
	}{
		{name: "wav", file: "tone.wav", audioFormat: "audio/wav", samples: 4_800, speakingTime: 0.1},
		{name: "aac", file: "tone.aac", audioFormat: "audio/aac", samples: 6_688, speakingTime: 6688.0 / 48_000},
		{name: "ogg vorbis", file: "tone.ogg", audioFormat: "audio/ogg", samples: 4_661, speakingTime: 4661.0 / 48_000},
		{name: "ogg opus", file: "tone-opus.ogg", audioFormat: "audio/ogg;codecs=opus", samples: 4_800, speakingTime: 0.1},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			voice, err := os.ReadFile(filepath.Join("testdata", test.file))
			if err != nil {
				t.Fatal(err)
			}
			result, err := decoder.Decode(context.Background(), protocol.SynthesizerResult{
				SpeechID: 7, Voice: voice, AudioFormat: test.audioFormat, SpeakingTime: test.speakingTime,
			})
			if err != nil {
				t.Fatalf("Decode() error = %v", err)
			}
			if len(result.PCM) != test.samples {
				t.Fatalf("PCM samples = %d, want %d", len(result.PCM), test.samples)
			}
			var nonZero bool
			for _, sample := range result.PCM {
				if sample != 0 {
					nonZero = true
					break
				}
			}
			if !nonZero {
				t.Fatal("PCM contains only silence")
			}
		})
	}
}

func TestFFmpegRejectsTruncatedAndMalformedFixtures(t *testing.T) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("system ffmpeg is unavailable")
	}
	decoder, err := NewDecoder(ffmpegPath, ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	wav, err := os.ReadFile(filepath.Join("testdata", "tone.wav"))
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name  string
		voice []byte
	}{
		{name: "truncated", voice: wav[:32]},
		{name: "malformed", voice: []byte("not an audio container")},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := decoder.Decode(context.Background(), protocol.SynthesizerResult{
				Voice: test.voice, AudioFormat: "audio/wav", SpeakingTime: 0.1,
			})
			if err == nil {
				t.Fatal("Decode() error = nil, want malformed input rejection")
			}
		})
	}
}
