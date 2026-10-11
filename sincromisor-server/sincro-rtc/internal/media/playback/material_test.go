package playback

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func fixture(t *testing.T) string {
	t.Helper()
	directory := t.TempDir()
	for _, name := range []string{"voice.opus", "synthesis.json"} {
		data, err := os.ReadFile(filepath.Join("../../../assets/playback/default", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return directory
}

func realDecoder(t *testing.T) *synthdecode.Decoder {
	t.Helper()
	decoder, err := synthdecode.NewDecoder("ffmpeg", synthdecode.ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	return decoder
}

func TestLoaderCachesOnlySuccessfulMaterial(t *testing.T) {
	directory := fixture(t)
	decoder := &countDecoder{decoder: realDecoder(t)}
	loader, _ := NewLoader(directory, decoder)
	path := filepath.Join(directory, "voice.opus")
	voice, _ := os.ReadFile(path)
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := loader.Load(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("missing: %v", err)
	}
	if err := os.WriteFile(path, voice, 0600); err != nil {
		t.Fatal(err)
	}
	first, err := loader.Load(context.Background())
	if err != nil || len(first.Speech.PCM) == 0 || len(first.Speech.Mora) == 0 {
		t.Fatalf("load: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	second, err := loader.Load(context.Background())
	if err != nil || decoder.calls.Load() != 1 || &first.Speech.PCM[0] != &second.Speech.PCM[0] {
		t.Fatalf("cache: %v, calls %d", err, decoder.calls.Load())
	}
}

func TestLoaderRejectsBrokenMaterial(t *testing.T) {
	cases := []struct {
		name  string
		edit  func(map[string]json.RawMessage)
		voice []byte
		raw   []byte
	}{
		{name: "broken opus", voice: []byte("not opus")},
		{name: "broken json", raw: []byte("{")},
		{name: "missing query", edit: func(r map[string]json.RawMessage) { delete(r, "query") }},
		{name: "empty query", edit: func(r map[string]json.RawMessage) { r["query"] = []byte("{}") }},
		{name: "missing mora", edit: func(r map[string]json.RawMessage) { delete(r, "mora_queue") }},
		{name: "missing length", edit: func(r map[string]json.RawMessage) { delete(r, "speaking_time") }},
		{name: "wrong mime", edit: func(r map[string]json.RawMessage) { r["audio_format"] = []byte(`"audio/wav"`) }},
		{name: "duration mismatch", edit: func(r map[string]json.RawMessage) { r["speaking_time"] = []byte("8") }},
		{name: "mora mismatch", edit: func(r map[string]json.RawMessage) {
			r["mora_queue"] = []byte(`[{"length":8,"vowel":"a","text":"あ"}]`)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			directory := fixture(t)
			path := filepath.Join(directory, "synthesis.json")
			raw, _ := os.ReadFile(path)
			if tc.edit != nil {
				var record map[string]json.RawMessage
				if err := json.Unmarshal(raw, &record); err != nil {
					t.Fatal(err)
				}
				tc.edit(record)
				raw, _ = json.Marshal(record)
			}
			if tc.raw != nil {
				raw = tc.raw
			}
			if err := os.WriteFile(path, raw, 0600); err != nil {
				t.Fatal(err)
			}
			if tc.voice != nil {
				if err := os.WriteFile(filepath.Join(directory, "voice.opus"), tc.voice, 0600); err != nil {
					t.Fatal(err)
				}
			}
			loader, _ := NewLoader(directory, realDecoder(t))
			if _, err := loader.Load(context.Background()); !errors.Is(err, ErrUnavailable) {
				t.Fatalf("Load error=%v", err)
			}
		})
	}
}

func TestLoaderCancelDoesNotCancelSharedDecode(t *testing.T) {
	decoder := &countDecoder{decoder: realDecoder(t), started: make(chan struct{}), release: make(chan struct{})}
	loader, _ := NewLoader(fixture(t), decoder)
	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() { _, err := loader.Load(ctx); first <- err }()
	<-decoder.started
	second := make(chan error, 1)
	go func() { _, err := loader.Load(context.Background()); second <- err }()
	cancel()
	select {
	case err := <-first:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("caller did not cancel")
	}
	close(decoder.release)
	select {
	case err := <-second:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(6 * time.Second):
		t.Fatal("shared load did not finish")
	}
	if decoder.calls.Load() != 1 {
		t.Fatal("shared material decoded more than once")
	}
	if _, err := loader.Load(context.Background()); err != nil {
		t.Fatal(err)
	}
}

type countDecoder struct {
	decoder *synthdecode.Decoder
	calls   atomic.Int32
	started chan struct{}
	release chan struct{}
}

func (d *countDecoder) Decode(ctx context.Context, input protocol.SynthesizerResult) (synthdecode.DecodedSpeech, error) {
	d.calls.Add(1)
	if d.started != nil {
		close(d.started)
		select {
		case <-d.release:
		case <-ctx.Done():
			return synthdecode.DecodedSpeech{}, ctx.Err()
		}
	}
	return d.decoder.Decode(ctx, input)
}
