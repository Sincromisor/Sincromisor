package output

import (
	"encoding/binary"
	"os"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// TestRecordedWorkerShortAudio は実Python Workerが生成した短音声の終端を本番再生へ渡す。
func TestRecordedWorkerShortAudio(t *testing.T) {
	path := os.Getenv("SINCRO_WORKER_SHORT_CHUNKS")
	if path == "" {
		t.Skip("実Workerの短音声が未指定")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	final := false
	samples := 0
	for len(raw) > 0 {
		if len(raw) < 4 {
			t.Fatal("missing size")
		}
		size := int(binary.BigEndian.Uint32(raw))
		raw = raw[4:]
		if size > len(raw) {
			t.Fatal("truncated chunk")
		}
		chunk, err := protocol.DecodeSynthesizerChunk(raw[:size])
		if err != nil {
			t.Fatal(err)
		}
		raw = raw[size:]
		enqueueChunk(t, p, chunk)
		samples += len(chunk.PCM) / 2
		final = chunk.Final
		if !final {
			frame, _, _ := p.nextFrame()
			if !allZero(frame) {
				t.Fatal("short audio started without final")
			}
		}
	}
	if !final || samples >= StreamBufferSamples || samples == 0 {
		t.Fatal("not a completed short audio")
	}
	frames := 0
	for p.Stats().QueuedSpeeches > 0 {
		p.nextFrame()
		frames++
	}
	if frames != (samples+frameSamples-1)/frameSamples {
		t.Fatalf("frames=%d samples=%d", frames, samples)
	}
	t.Logf("WORKER_SHORT samples=%d frames=%d final=true", samples, frames)
}
