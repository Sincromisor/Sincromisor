package output

import (
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
)

func BenchmarkNextFrameSilence(b *testing.B) {
	processor := &Processor{}
	b.ReportAllocs()
	for b.Loop() {
		frame, _, _ := processor.nextFrame()
		if len(frame) != frameSamples {
			b.Fatal("unexpected frame size")
		}
	}
}

func TestNextFrameClearsPreviousAudio(t *testing.T) {
	processor := newProcessorForTest(t)
	pcm := make([]int16, frameSamples+1)
	for i := range pcm {
		pcm[i] = 123
	}
	if err := processor.Enqueue("fixture", synthdecode.DecodedSpeech{SpeechID: 1, PCM: pcm}); err != nil {
		t.Fatal(err)
	}
	first, _, _ := processor.nextFrame()
	if first[frameSamples-1] != 123 {
		t.Fatal("full frame lost audio")
	}
	tail, _, _ := processor.nextFrame()
	if tail[0] != 123 {
		t.Fatal("tail sample lost audio")
	}
	for _, value := range tail[1:] {
		if value != 0 {
			t.Fatal("tail contains previous audio")
		}
	}
	silence, _, _ := processor.nextFrame()
	for _, value := range silence {
		if value != 0 {
			t.Fatal("silence contains previous audio")
		}
	}
}
