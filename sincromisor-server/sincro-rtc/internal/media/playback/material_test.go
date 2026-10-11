package playback

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestLoaderCachesOnlySuccessfulMaterial(t *testing.T) {
	directory := t.TempDir()
	decoder := &recordingDecoder{}
	loader, err := NewLoader(directory, decoder)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := loader.Load(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("missing material error = %v, want ErrUnavailable", err)
	}
	if err := os.WriteFile(filepath.Join(directory, "voice.opus"), []byte("voice"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "synthesis.json"), []byte(`{"message":"sample","query":{},"mora_queue":[],"speaking_time":0.02,"audio_format":"audio/ogg;codecs=opus"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	first, err := loader.Load(context.Background())
	if err != nil || first.Message != "sample" || decoder.calls != 1 {
		t.Fatalf("first Load() = %+v, %v; calls=%d", first, err, decoder.calls)
	}
	if err := os.Remove(filepath.Join(directory, "voice.opus")); err != nil {
		t.Fatal(err)
	}
	if _, err := loader.Load(context.Background()); err != nil || decoder.calls != 1 {
		t.Fatalf("cached Load() error = %v; calls=%d", err, decoder.calls)
	}
}

type recordingDecoder struct{ calls int }

func (d *recordingDecoder) Decode(_ context.Context, input protocol.SynthesizerResult) (synthdecode.DecodedSpeech, error) {
	d.calls++
	if string(input.Voice) != "voice" || input.AudioFormat != "audio/ogg;codecs=opus" {
		return synthdecode.DecodedSpeech{}, errors.New("unexpected material")
	}
	return synthdecode.DecodedSpeech{PCM: []int16{1}}, nil
}
