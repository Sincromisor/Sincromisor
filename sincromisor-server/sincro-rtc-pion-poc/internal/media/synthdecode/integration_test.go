package synthdecode

import (
	"context"
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

func TestFFmpegDownmixesDistinctStereoChannelsToPCMGoldenAndMapsMora(t *testing.T) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("system ffmpeg is unavailable")
	}
	decoder, err := NewDecoder(ffmpegPath, ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	const (
		samples     = 480
		leftSample  = int16(1_000)
		rightSample = int16(3_000)
		wantAverage = int16(2_000)
	)
	vowel := "a"
	text := "あ"
	result, err := decoder.Decode(context.Background(), protocol.SynthesizerResult{
		SpeechID:     91,
		Voice:        stereoPCMFixture(samples, leftSample, rightSample),
		AudioFormat:  "audio/wav",
		SpeakingTime: 0.01,
		MoraQueue: []protocol.SynthesizerMora{
			{Vowel: &vowel, Text: &text, Length: 0.004},
			{Length: 0.006},
		},
	})
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if len(result.PCM) != samples {
		t.Fatalf("PCM samples = %d, want %d", len(result.PCM), samples)
	}
	for index, sample := range result.PCM {
		if sample != wantAverage {
			t.Fatalf("PCM[%d] = %d, want arithmetic channel average %d", index, sample, wantAverage)
		}
	}
	wantBounds := [][2]uint64{{0, 192}, {192, 480}}
	for index, mora := range result.Mora {
		if mora.StartSample != wantBounds[index][0] || mora.EndSample != wantBounds[index][1] {
			t.Fatalf("Mora[%d] = %d..%d, want %d..%d",
				index, mora.StartSample, mora.EndSample, wantBounds[index][0], wantBounds[index][1])
		}
	}
	if result.Mora[0].Vowel != &vowel || result.Mora[0].Text != &text {
		t.Fatal("real fixture decode did not preserve mora pointers")
	}
}

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

func TestFFmpegRejectsTruncatedAndMalformedFixturesByFormat(t *testing.T) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("system ffmpeg is unavailable")
	}
	decoder, err := NewDecoder(ffmpegPath, ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	formats := []struct {
		name        string
		file        string
		audioFormat string
	}{
		{name: "wav", file: "tone.wav", audioFormat: "audio/wav"},
		{name: "aac", file: "tone.aac", audioFormat: "audio/aac"},
		{name: "ogg vorbis", file: "tone.ogg", audioFormat: "audio/ogg"},
		{name: "ogg opus", file: "tone-opus.ogg", audioFormat: "audio/ogg;codecs=opus"},
	}
	for _, format := range formats {
		t.Run(format.name, func(t *testing.T) {
			fixture, err := os.ReadFile(filepath.Join("testdata", format.file))
			if err != nil {
				t.Fatal(err)
			}
			for _, test := range []struct {
				name  string
				voice []byte
			}{
				{name: "truncated", voice: fixture[:1]},
				{name: "malformed", voice: []byte("not an audio container")},
			} {
				t.Run(test.name, func(t *testing.T) {
					result, err := decoder.Decode(context.Background(), protocol.SynthesizerResult{
						Voice: test.voice, AudioFormat: format.audioFormat, SpeakingTime: 0.1,
					})
					assertDecodeKind(t, err, ErrorProcess)
					assertZeroDecodedSpeech(t, result)
				})
			}
		})
	}
}

// stereoPCMFixtureは48 kHz stereo s16leの決定的なWAV containerを生成する。
// 左右を異なる定数にすることで、real FFmpeg pathのmono出力をsample単位のgolden値で検証できる。
func stereoPCMFixture(samples int, left int16, right int16) []byte {
	const (
		channels      = 2
		sampleRate    = 48_000
		bitsPerSample = 16
		headerBytes   = 44
	)
	dataBytes := samples * channels * (bitsPerSample / 8)
	output := make([]byte, headerBytes+dataBytes)
	copy(output[0:4], "RIFF")
	binary.LittleEndian.PutUint32(output[4:8], uint32(len(output)-8))
	copy(output[8:12], "WAVE")
	copy(output[12:16], "fmt ")
	binary.LittleEndian.PutUint32(output[16:20], 16)
	binary.LittleEndian.PutUint16(output[20:22], 1)
	binary.LittleEndian.PutUint16(output[22:24], channels)
	binary.LittleEndian.PutUint32(output[24:28], sampleRate)
	binary.LittleEndian.PutUint32(output[28:32], sampleRate*channels*(bitsPerSample/8))
	binary.LittleEndian.PutUint16(output[32:34], channels*(bitsPerSample/8))
	binary.LittleEndian.PutUint16(output[34:36], bitsPerSample)
	copy(output[36:40], "data")
	binary.LittleEndian.PutUint32(output[40:44], uint32(dataBytes))
	for index := range samples {
		offset := headerBytes + index*4
		binary.LittleEndian.PutUint16(output[offset:offset+2], uint16(left))
		binary.LittleEndian.PutUint16(output[offset+2:offset+4], uint16(right))
	}
	return output
}
