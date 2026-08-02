package media

import (
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
)

func TestOutputMetricsBalanceQueueAndRecordFrameCodecPacing(t *testing.T) {
	observer := &recordingOutputObserver{depth: make(map[string]float64)}
	processor, err := newOutputProcessorWithHooks(
		&metricEncoder{}, discardSampleWriter{}, nil,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		systemOutputClock{}, 0, observer,
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := processor.Enqueue("payload-chat-marker", synthdecode.DecodedSpeech{
		SpeechID: 1, PCM: make([]int16, frameSamples),
	}); err != nil {
		t.Fatal(err)
	}
	if err := processor.writeFrame(); err != nil {
		t.Fatal(err)
	}
	if observer.depth["speech"] != 0 || observer.sent != 1 {
		t.Fatalf("queue/sent = %v/%d, want 0/1", observer.depth["speech"], observer.sent)
	}

	processor.encoder = &metricEncoder{err: errors.New("payload-audio-marker")}
	if err := processor.writeFrame(); err == nil {
		t.Fatal("encode error was not returned")
	}
	if observer.codec != 1 || observer.abort["codec"] != 1 {
		t.Fatalf("codec/abort = %d/%v", observer.codec, observer.abort)
	}

	if err := processor.Enqueue("payload-chat-marker", synthdecode.DecodedSpeech{
		SpeechID: 2, PCM: make([]int16, frameSamples),
	}); err != nil {
		t.Fatal(err)
	}
	processor.abortCurrentSpeech(SpeechLagAbortThreshold)
	if observer.depth["speech"] != 0 || observer.abort["lag"] != 1 {
		t.Fatalf("lag queue/abort = %v/%v", observer.depth["speech"], observer.abort)
	}
}

type metricEncoder struct{ err error }

func (e *metricEncoder) Encode([]int16) ([]byte, error) {
	if e.err != nil {
		return nil, e.err
	}
	return []byte{1}, nil
}

type recordingOutputObserver struct {
	depth    map[string]float64
	sent     int
	codec    int
	abort    map[string]int
	overflow int
}

func (o *recordingOutputObserver) AudioFrame(_ string, outcome string) {
	if outcome == "sent" {
		o.sent++
	}
}
func (*recordingOutputObserver) PacingLag(float64) {}
func (o *recordingOutputObserver) PacingAbort(reason string) {
	if o.abort == nil {
		o.abort = make(map[string]int)
	}
	o.abort[reason]++
}
func (o *recordingOutputObserver) CodecError(string) { o.codec++ }
func (o *recordingOutputObserver) QueueDepthDelta(queue string, delta float64) {
	o.depth[queue] += delta
}
func (o *recordingOutputObserver) QueueOverflow(string, string) { o.overflow++ }
