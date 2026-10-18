package output

import (
	"context"
	"encoding/binary"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestStreamBuffersAndResumesWithoutLosingPartialFrameOrMora(t *testing.T) {
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	samples := make([]int16, 28803)
	for index := range samples {
		samples[index] = int16(index%30000 + 1)
	}
	vowel, text := "a", "ア"
	chunk := streamChunk(1, 7, 0, 0, samples[:4801])
	chunk.MoraQueue = []protocol.SynthesizerMora{{Vowel: &vowel, Text: &text, Length: .6}}
	enqueueChunk(t, p, chunk)
	frame, telop, _ := p.nextFrame()
	if !allZero(frame) || telop != nil {
		t.Fatal("played before initial buffer")
	}
	enqueueChunk(t, p, streamChunk(1, 7, 1, 4801, samples[4801:9602]))
	enqueueChunk(t, p, streamChunk(1, 7, 2, 9602, samples[9602:14403]))
	var actual []int16
	for index := range 15 {
		frame, telop, _ = p.nextFrame()
		actual = append(actual, frame...)
		if telop == nil || telop.NewText != (index == 0) || telop.Timestamp != float64(index*960)/SampleRate {
			t.Fatalf("mora reset at frame %d: %+v", index, telop)
		}
	}
	for range 3 {
		frame, telop, _ = p.nextFrame()
		if !allZero(frame) || telop != nil {
			t.Fatal("underflow did not pause PCM and mora")
		}
	}
	enqueueChunk(t, p, streamChunk(1, 7, 3, 14403, samples[14403:24003]))
	frame, _, _ = p.nextFrame()
	if !allZero(frame) {
		t.Fatal("resumed before buffer replenished")
	}
	enqueueChunk(t, p, streamChunk(1, 7, 4, 24003, samples[24003:]))
	frame, telop, _ = p.nextFrame()
	actual = append(actual, frame...)
	if telop == nil || telop.NewText || telop.Timestamp != .3 {
		t.Fatalf("resumed mora = %+v", telop)
	}
	enqueueChunk(t, p, streamEnd(1, 7, 5, len(samples)))
	for p.Stats().QueuedSpeeches > 0 {
		frame, _, _ = p.nextFrame()
		actual = append(actual, frame...)
	}
	if !reflect.DeepEqual(actual[:len(samples)], samples) || !allZero(actual[len(samples):]) {
		t.Fatal("chunk boundary lost, reordered, or repeated PCM")
	}
	if p.Stats().QueuedSamples != 0 {
		t.Fatal("sample accounting did not drain")
	}
}

func TestStreamShortFinalAndSameSpeechTextIncrementKeepSampleClock(t *testing.T) {
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	for requestID, count := range []int{1001, 960} {
		value := streamChunk(int64(requestID+1), 7, 0, 0, make([]int16, count))
		vowel := "a"
		value.MoraQueue = []protocol.SynthesizerMora{{Vowel: &vowel, Length: float64(count) / SampleRate}}
		enqueueChunk(t, p, value)
		enqueueChunk(t, p, streamEnd(int64(requestID+1), 7, 1, count))
		_, telop, _ := p.nextFrame()
		expected := 0.0
		if requestID == 1 {
			expected = 1001.0 / SampleRate
		}
		if telop == nil || telop.Timestamp != expected || !telop.NewText {
			t.Fatalf("increment timestamp = %+v, want %v", telop, expected)
		}
		if count > 960 {
			p.nextFrame()
		}
	}
	if p.Stats().QueuedSpeeches != 0 {
		t.Fatal("short final did not drain")
	}
}

func TestStreamTerminalAfterLastWholeFrameRemovesWaitingItem(t *testing.T) {
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	enqueueChunk(t, p, streamChunk(1, 7, 0, 0, make([]int16, StreamBufferSamples)))
	for range 15 {
		p.nextFrame()
	}
	if p.Stats().QueuedSpeeches != 1 || p.hasActiveSpeech() {
		t.Fatal("incomplete request was completed or treated as active")
	}
	enqueueChunk(t, p, streamEnd(1, 7, 1, StreamBufferSamples))
	if p.Stats().QueuedSpeeches != 0 {
		t.Fatal("terminal left an empty playback item")
	}
}

func TestStreamAbortDropsLateChunksAndPurgeAllowsNewConnection(t *testing.T) {
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	enqueueChunk(t, p, streamChunk(1, 7, 0, 0, make([]int16, StreamBufferSamples)))
	p.nextFrame()
	p.abortCurrentSpeech(300 * time.Millisecond)
	enqueueChunk(t, p, streamChunk(1, 7, 1, StreamBufferSamples, make([]int16, 960)))
	enqueueChunk(t, p, streamEnd(1, 7, 2, StreamBufferSamples+960))
	if p.Stats().QueuedSpeeches != 0 || p.Stats().QueuedSamples != 0 {
		t.Fatal("late chunk revived aborted request")
	}
	if err := p.EnqueueChunk(streamChunk(1, 7, 0, 0, make([]int16, 960))); err == nil {
		t.Fatal("completed request revived")
	}
	p.Purge()
	enqueueChunk(t, p, streamChunk(1, 8, 0, 0, make([]int16, 960)))
	if p.Stats().QueuedSpeeches != 1 {
		t.Fatal("new generation rejected first request")
	}
	_ = p.Close()
	if !errors.Is(p.EnqueueChunk(streamEnd(1, 8, 1, 960)), ErrOutputClosed) {
		t.Fatal("closed processor accepted chunk")
	}
}

func TestStreamRejectsNinthQueuedRequestAndInvalidTerminalMora(t *testing.T) {
	p := newOutputWithFakes(t, &fakeOutputEncoder{}, newFakeOutputTrack(), newFakeOutputClock(), 0)
	for requestID := int64(1); requestID <= 8; requestID++ {
		enqueueChunk(t, p, streamChunk(requestID, requestID, 0, 0, make([]int16, 960)))
		enqueueChunk(t, p, streamEnd(requestID, requestID, 1, 960))
	}
	if !errors.Is(p.EnqueueChunk(streamChunk(9, 9, 0, 0, make([]int16, 960))), ErrSpeechQueueFull) {
		t.Fatal("ninth queued request accepted")
	}
	p.Purge()
	bad := streamChunk(1, 1, 0, 0, make([]int16, 960))
	text := "ア"
	bad.MoraQueue = []protocol.SynthesizerMora{{Text: &text, Length: 1}}
	enqueueChunk(t, p, bad)
	if err := p.EnqueueChunk(streamEnd(1, 1, 1, 960)); err == nil {
		t.Fatal("missing PCM accepted as completed audio")
	}
}

func streamChunk(requestID, speechID, sequence int64, offset int, pcm []int16) protocol.SynthesizerChunk {
	raw := make([]byte, len(pcm)*2)
	for index, sample := range pcm {
		binary.LittleEndian.PutUint16(raw[index*2:], uint16(sample))
	}
	return protocol.SynthesizerChunk{RequestID: requestID, SpeechID: speechID, Sequence: sequence, SampleOffset: int64(offset), PCM: raw, MoraQueue: []protocol.SynthesizerMora{}}
}
func streamEnd(requestID, speechID, sequence int64, samples int) protocol.SynthesizerChunk {
	value := streamChunk(requestID, speechID, sequence, samples, []int16{})
	value.Final = true
	return value
}
func enqueueChunk(t *testing.T, p *Processor, value protocol.SynthesizerChunk) {
	t.Helper()
	if err := p.EnqueueChunk(value); err != nil {
		t.Fatalf("EnqueueChunk(%d/%d): %v", value.RequestID, value.Sequence, err)
	}
}
func allZero(samples []int16) bool {
	for _, sample := range samples {
		if sample != 0 {
			return false
		}
	}
	return true
}

func TestStreamClockOutputsBeforeCompletionAndDoesNotAbortReceiveWait(t *testing.T) {
	clock := newFakeOutputClock()
	track := newFakeOutputTrack()
	encoder := &fakeOutputEncoder{}
	p := newOutputWithFakes(t, encoder, track, clock, 0)
	pcm := make([]int16, StreamBufferSamples)
	for index := range pcm {
		pcm[index] = 1000
	}
	enqueueChunk(t, p, streamChunk(1, 1, 0, 0, pcm[:4800]))
	ctx, cancel := context.WithCancel(context.Background())
	done := runOutput(t, p, ctx)
	clock.waitTimer(t)
	clock.advance(time.Second)
	receiveSample(t, track)
	if p.Stats().SpeechAborted != 0 || p.Stats().QueuedSamples != 4800 {
		t.Fatal("initial receive wait aborted or consumed speech")
	}
	enqueueChunk(t, p, streamChunk(1, 1, 1, 4800, pcm[4800:]))
	for index := range 15 {
		clock.advance(FrameDuration)
		receiveSample(t, track)
		if allZero(encoder.frameAt(t, index+1)) {
			t.Fatal("no PCM output before completion")
		}
	}
	clock.advance(time.Second)
	receiveSample(t, track)
	if p.Stats().SpeechAborted != 0 || p.Stats().QueuedSpeeches != 1 {
		t.Fatal("underflow was treated as scheduler speech lag")
	}
	enqueueChunk(t, p, streamEnd(1, 1, 2, len(pcm)))
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run stopped: %v", err)
	}
}
