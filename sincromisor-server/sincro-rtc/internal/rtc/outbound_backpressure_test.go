package rtc

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	outputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc/datachannel"
)

func TestSynthOutputBackpressureWaitsThenPlaysEveryRequest(t *testing.T) {
	s, telops := newBackpressureSession(t)
	fillShortSynthesisQueue(t, s)
	done := make(chan error, 1)
	go func() { done <- s.handleSynthChunkOutput(shortSynthesisChunk(9, false)) }()
	assertSynthesisWaiting(t, done)
	runDone := make(chan error, 1)
	go func() { runDone <- s.output.Run(s.ctx) }()
	t.Cleanup(func() {
		s.cancel()
		select {
		case <-runDone:
		case <-time.After(time.Second):
			t.Error("output clock did not stop")
		}
	})
	awaitSynthesis(t, done)
	if err := s.handleSynthChunkOutput(shortSynthesisChunk(9, true)); err != nil {
		t.Fatal(err)
	}
	for id := int64(10); id <= 24; id++ {
		for _, final := range []bool{false, true} {
			if err := s.handleSynthChunkOutput(shortSynthesisChunk(id, final)); err != nil {
				t.Fatalf("request %d final=%v: %v", id, final, err)
			}
			stats := s.output.Stats()
			if stats.QueuedSpeeches > outputmedia.SpeechQueueCapacity || stats.QueuedSamples >= outputmedia.StreamBufferSamples+protocol.SynthChunkSampleLimit {
				t.Fatalf("unbounded playback queue: %+v", stats)
			}
		}
	}
	for id := int64(1); id <= 24; id++ {
		select {
		case value := <-telops:
			if value.SpeechID != id || !value.NewText {
				t.Fatalf("telop = %+v, want request %d", value, id)
			}
		case <-time.After(time.Second):
			t.Fatalf("missing playback for request %d", id)
		}
	}
	if stats := s.output.Stats(); stats.QueuedSamples != 0 || stats.QueuedSpeeches != 0 || stats.SpeechAborted != 0 {
		t.Fatalf("playback did not drain cleanly: %+v", stats)
	}
}

func TestSynthOutputBackpressureReleasesOnCancellationCloseAndGeneration(t *testing.T) {
	for _, operation := range []string{"cancel", "close", "generation"} {
		t.Run(operation, func(t *testing.T) {
			s, _ := newBackpressureSession(t)
			fillShortSynthesisQueue(t, s)
			done := make(chan error, 1)
			go func() { done <- s.handleSynthChunkOutput(shortSynthesisChunk(9, false)) }()
			assertSynthesisWaiting(t, done)
			switch operation {
			case "cancel":
				s.cancel()
			case "close":
				_ = s.output.Close()
			case "generation":
				if accepted, err := s.applyGeneration(2, nil); !accepted || err != nil {
					t.Fatalf("generation reset: %v, %v", accepted, err)
				}
			}
			awaitSynthesis(t, done)
			if operation != "cancel" && s.output.Stats().QueuedSpeeches != 0 {
				t.Fatal("old chunk restored playback after close or generation change")
			}
		})
	}
}

func newBackpressureSession(t *testing.T) (*Session, <-chan outputmedia.TelopPayload) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	encoder, err := outputmedia.NewEncoder()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = encoder.Close() })
	dispatcher, err := datachannel.New(ctx, logger, func(error) {})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = dispatcher.Close() })
	telops := make(chan outputmedia.TelopPayload, 32)
	output, err := outputmedia.New(encoder, rtcDiscardTrack{}, func(value outputmedia.TelopPayload) error {
		telops <- value
		return nil
	}, logger)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = output.Close() })
	return &Session{ctx: ctx, cancel: cancel, output: output, dispatcher: dispatcher, outboundGeneration: 1}, telops
}

func fillShortSynthesisQueue(t *testing.T, s *Session) {
	t.Helper()
	for id := int64(1); id <= outputmedia.SpeechQueueCapacity; id++ {
		for _, final := range []bool{false, true} {
			if err := s.handleSynthChunkOutput(shortSynthesisChunk(id, final)); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func shortSynthesisChunk(id int64, final bool) pipeline.Output[protocol.SynthesizerChunk] {
	value := protocol.SynthesizerChunk{RequestID: id, SpeechID: id, Final: final}
	if final {
		value.Sequence, value.SampleOffset = 1, 960
		value.PCM, value.MoraQueue = []byte{}, []protocol.SynthesizerMora{}
	} else {
		value.PCM = make([]byte, 1920)
		text := "音"
		value.MoraQueue = []protocol.SynthesizerMora{{Text: &text, Length: .02}}
	}
	return pipeline.Output[protocol.SynthesizerChunk]{Generation: 1, Value: value}
}

func assertSynthesisWaiting(t *testing.T, done <-chan error) {
	t.Helper()
	select {
	case err := <-done:
		t.Fatalf("full queue returned instead of waiting: %v", err)
	case <-time.After(2 * outputmedia.FrameDuration):
	}
}

func awaitSynthesis(t *testing.T, done <-chan error) {
	t.Helper()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("synthesis wait did not finish")
	}
}
