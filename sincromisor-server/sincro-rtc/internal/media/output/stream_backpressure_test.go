package output

import (
	"errors"
	"reflect"
	"testing"
)

func TestStreamBackpressurePreservesChunkUntilPlaybackMakesRoom(t *testing.T) {
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	first := make([]int16, StreamBufferSamples)
	second := make([]int16, SampleRate/2)
	for index := range first {
		first[index] = 1000
	}
	for index := range second {
		second[index] = 2000
	}
	enqueueChunk(t, p, streamChunk(1, 7, 0, 0, first))
	chunk := streamChunk(1, 7, 1, len(first), second)
	before := p.Stats()
	if err := p.EnqueueChunk(chunk); !errors.Is(err, ErrSpeechQueueFull) {
		t.Fatalf("buffered chunk error = %v, want ErrSpeechQueueFull", err)
	}
	if got := p.Stats(); got != before {
		t.Fatalf("waiting changed queue: before=%+v after=%+v", before, got)
	}
	frame, _, _ := p.nextFrame()
	actual := append([]int16(nil), frame...)
	enqueueChunk(t, p, chunk)
	if got := p.Stats().QueuedSamples; got >= StreamBufferSamples+SampleRate/2 {
		t.Fatalf("queued samples = %d, exceeds initial buffer plus one chunk", got)
	}
	// 終端は未再生量にかかわらず受理し、短い音声も完成状態へ進める。
	enqueueChunk(t, p, streamEnd(1, 7, 2, len(first)+len(second)))
	for p.Stats().QueuedSpeeches > 0 {
		frame, _, _ = p.nextFrame()
		actual = append(actual, frame...)
	}
	if want := append(first, second...); !reflect.DeepEqual(actual, want) {
		t.Fatal("backpressure lost, repeated, or reordered PCM")
	}
}
