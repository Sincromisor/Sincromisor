package output

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"testing"
)

// TestRecordedEngineArrivals は実HTTPの到着列を20ms時計で再生し、音声と不足待機を比較する。
// PCM原本は環境変数で指定し、公開ログには本文・波形を残さず集計だけ出す。
func TestRecordedEngineArrivals(t *testing.T) {
	path := os.Getenv("SINCRO_STREAMING_ARRIVALS")
	if path == "" {
		t.Skip("実EngineのPCM到着列が未指定")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var trace struct {
		Segment float64
		Chunks  []struct {
			AtMS      float64 `json:"at_ms"`
			RequestID int64   `json:"request_id"`
			Final     bool
			PCM       []byte
		}
	}
	if err := json.Unmarshal(raw, &trace); err != nil {
		t.Fatal(err)
	}
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	index, offset, played, gaps, gapFrames := 0, 0, 0, 0, 0
	requestID, sequence := int64(1), int64(0)
	firstVoice, firstPCM := -1, trace.Chunks[0].AtMS
	ended, started, waiting := false, false, false
	var expected, actual []int16
	for _, chunk := range trace.Chunks {
		for i := 0; i < len(chunk.PCM); i += 2 {
			expected = append(expected, int16(binary.LittleEndian.Uint16(chunk.PCM[i:])))
		}
	}
	for tick := 0; tick < 120000; tick += 20 {
		for index < len(trace.Chunks) && trace.Chunks[index].AtMS <= float64(tick) {
			input := trace.Chunks[index]
			samples := make([]int16, len(input.PCM)/2)
			for i := range samples {
				samples[i] = int16(binary.LittleEndian.Uint16(input.PCM[i*2:]))
			}
			if !input.Final && p.Stats().QueuedSamples >= StreamBufferSamples {
				break
			}
			// 要求IDと終端がある到着列は、要求ごとの初期待機と末尾の端数も再現する。
			// IDのない従来の到着列は、一要求の連続PCMとして引き続き再生する。
			if input.RequestID > 0 && input.RequestID != requestID {
				requestID, sequence, offset = input.RequestID, 0, 0
			}
			if input.Final {
				enqueueChunk(t, p, streamEnd(requestID, 7, sequence, offset))
			} else {
				enqueueChunk(t, p, streamChunk(requestID, 7, sequence, offset, samples))
			}
			offset += len(samples)
			sequence++
			index++
		}
		if index == len(trace.Chunks) && !ended {
			if !trace.Chunks[len(trace.Chunks)-1].Final {
				enqueueChunk(t, p, streamEnd(requestID, 7, sequence, offset))
			}
			ended = true
		}
		before := p.Stats().QueuedSamples
		frame, _, _ := p.nextFrame()
		consumed := before - p.Stats().QueuedSamples
		if consumed > 0 {
			started = true
			waiting = false
			actual = append(actual, frame[:consumed]...)
			played += consumed
			for _, s := range frame {
				if firstVoice < 0 && math.Abs(float64(s)) > 500 {
					firstVoice = tick
				}
			}
		} else if started && !ended {
			if !waiting {
				gaps++
				waiting = true
			}
			gapFrames++
		}
		if ended && p.Stats().QueuedSpeeches == 0 {
			if len(actual) != len(expected) {
				t.Fatalf("samples=%d want=%d", len(actual), len(expected))
			}
			for i := range expected {
				if actual[i] != expected[i] {
					t.Fatalf("PCM differs at %d", i)
				}
			}
			t.Logf("ARRIVALS segment=%.2f first_pcm_ms=%.1f first_voice_ms=%d rebuffer_count=%d rebuffer_ms=%d complete_ms=%d samples=%d", trace.Segment, firstPCM, firstVoice, gaps, gapFrames*20, tick, played)
			return
		}
	}
	t.Fatal("playback did not complete")
}

func TestStreamStartAtExactBufferBoundary(t *testing.T) {
	for _, count := range []int{StreamBufferSamples - 1, StreamBufferSamples, StreamBufferSamples + 1} {
		p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
		samples := make([]int16, count)
		for i := range samples {
			samples[i] = 1000
		}
		enqueueChunk(t, p, streamChunk(1, 7, 0, 0, samples))
		frame, _, _ := p.nextFrame()
		if allZero(frame) != (count < StreamBufferSamples) {
			t.Fatalf("start count=%d", count)
		}
		if count < StreamBufferSamples {
			enqueueChunk(t, p, streamEnd(1, 7, 1, count))
			frame, _, _ = p.nextFrame()
			if allZero(frame) {
				t.Fatal("short final did not start")
			}
		}
	}
}
