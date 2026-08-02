package media

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	pionopus "github.com/pion/opus"
	pionmedia "github.com/pion/webrtc/v4/pkg/media"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
)

func TestOutputSpeechQueueBoundaries(t *testing.T) {
	t.Run("speech count", func(t *testing.T) {
		processor := newOutputProcessorForTest(t)
		speech := synthdecode.DecodedSpeech{SpeechID: 1, PCM: []int16{1}}
		for index := 0; index < SpeechQueueCapacity; index++ {
			if err := processor.Enqueue("message", speech); err != nil {
				t.Fatalf("Enqueue(%d) error = %v", index, err)
			}
		}
		if err := processor.Enqueue("overflow", speech); !errors.Is(err, ErrSpeechQueueFull) {
			t.Fatalf("overflow error = %v, want ErrSpeechQueueFull", err)
		}
		if got := len(processor.queue); got != SpeechQueueCapacity {
			t.Fatalf("queue length = %d, want %d", got, SpeechQueueCapacity)
		}
	})

	for _, test := range []struct {
		name    string
		samples int
		wantErr error
	}{
		{name: "limit minus one", samples: SpeechQueueSampleCapacity - 1},
		{name: "exact limit", samples: SpeechQueueSampleCapacity},
		{name: "limit plus one", samples: SpeechQueueSampleCapacity + 1, wantErr: ErrSpeechQueueFull},
	} {
		t.Run(test.name, func(t *testing.T) {
			processor := newOutputProcessorForTest(t)
			err := processor.Enqueue("message", synthdecode.DecodedSpeech{
				SpeechID: 1, PCM: make([]int16, test.samples),
			})
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("Enqueue(%d) error = %v, want %v", test.samples, err, test.wantErr)
			}
		})
	}
}

func TestOutputTelopUsesAudioFrameSampleTick(t *testing.T) {
	processor := newOutputProcessorForTest(t)
	empty := ""
	secondText := "ka"
	if err := processor.Enqueue("decode-before-message", synthdecode.DecodedSpeech{
		SpeechID: 42,
		PCM:      make([]int16, frameSamples*4),
		Mora: []synthdecode.TimedMora{
			{Vowel: nil, Text: &empty, StartSample: 0, EndSample: 1200},
			{Vowel: &empty, Text: &secondText, StartSample: 1200, EndSample: 3840},
		},
	}); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}

	_, first := processor.nextFrame()
	_, second := processor.nextFrame()
	_, third := processor.nextFrame()
	_, fourth := processor.nextFrame()
	if first == nil || second == nil || third == nil || fourth == nil {
		t.Fatal("active mora frame did not produce telop")
	}
	if !first.NewText || second.NewText {
		t.Fatalf("first mora new_text = %v/%v, want true/false", first.NewText, second.NewText)
	}
	if first.Vowel != "" || first.Text != "" || first.Message != "decode-before-message" {
		t.Fatalf("nil/empty/message wire conversion = %+v", first)
	}
	if second.Timestamp != float64(frameSamples)/SampleRate ||
		second.Length != float64(1200)/SampleRate {
		t.Fatalf("second frame timing = timestamp %v length %v", second.Timestamp, second.Length)
	}
	if !third.NewText || fourth.NewText || third.Text != secondText {
		t.Fatalf("frame-contained boundary switch = third %+v fourth %+v", third, fourth)
	}
	if third.Timestamp != float64(frameSamples*2)/SampleRate {
		t.Fatalf("third timestamp = %v", third.Timestamp)
	}
}

func TestOutputFrameWithoutActiveMoraSendsAudioOnly(t *testing.T) {
	processor := newOutputProcessorForTest(t)
	if err := processor.Enqueue("message", synthdecode.DecodedSpeech{
		SpeechID: 1,
		PCM:      make([]int16, frameSamples),
		Mora: []synthdecode.TimedMora{
			{StartSample: frameSamples / 2, EndSample: frameSamples},
		},
	}); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}
	frame, telop := processor.nextFrame()
	if len(frame) != frameSamples || telop != nil {
		t.Fatalf("frame/telop = %d/%+v, want audio only", len(frame), telop)
	}
}

func TestOutputPurgeDropsCurrentAndQueuedSpeech(t *testing.T) {
	processor := newOutputProcessorForTest(t)
	for id := int64(1); id <= 2; id++ {
		if err := processor.Enqueue("message", synthdecode.DecodedSpeech{
			SpeechID: id, PCM: make([]int16, frameSamples*2),
		}); err != nil {
			t.Fatalf("Enqueue(%d) error = %v", id, err)
		}
	}
	processor.nextFrame()
	processor.Purge()
	if len(processor.queue) != 0 || processor.queuedSamples != 0 {
		t.Fatalf("purged queue = %d/%d, want empty", len(processor.queue), processor.queuedSamples)
	}
	frame, telop := processor.nextFrame()
	if telop != nil {
		t.Fatalf("silence frame produced telop: %+v", telop)
	}
	for _, sample := range frame {
		if sample != 0 {
			t.Fatal("frame after purge was not silence")
		}
	}
}

func TestOutputClockSendsQueuedFiftyFramesWithoutInboundCadence(t *testing.T) {
	encoder, err := NewFrameEncoder()
	if err != nil {
		t.Fatalf("NewFrameEncoder() error = %v", err)
	}
	t.Cleanup(func() { _ = encoder.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	track := &timingSampleWriter{target: 50, reached: make(chan struct{}), cancel: cancel}
	processor, err := NewOutputProcessor(
		encoder, track, nil, slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatalf("NewOutputProcessor() error = %v", err)
	}
	if err := processor.Enqueue("message", synthdecode.DecodedSpeech{
		SpeechID: 1, PCM: make([]int16, frameSamples*50),
	}); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}
	runDone := make(chan error, 1)
	go func() { runDone <- processor.Run(ctx) }()
	select {
	case <-track.reached:
	case <-time.After(2 * time.Second):
		t.Fatal("50 outbound frames did not complete")
	}
	if err := <-runDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	track.mu.Lock()
	times := append([]time.Time(nil), track.times...)
	track.mu.Unlock()
	elapsed := times[len(times)-1].Sub(times[0])
	if elapsed < 850*time.Millisecond || elapsed > 1200*time.Millisecond {
		t.Fatalf("50 frame elapsed = %v, want real-time 20 ms cadence", elapsed)
	}
}

func TestFrameEncoderMonoPCMDecodesThroughStereoCapabilityCodec(t *testing.T) {
	encoder, err := NewFrameEncoder()
	if err != nil {
		t.Fatalf("NewFrameEncoder() error = %v", err)
	}
	defer func() { _ = encoder.Close() }()
	frame := make([]int16, frameSamples)
	for index := range frame {
		frame[index] = int16(index%200 - 100)
	}
	packet, err := encoder.Encode(frame)
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}
	decoder, err := pionopus.NewDecoderWithOutput(SampleRate, 2)
	if err != nil {
		t.Fatalf("NewDecoderWithOutput() error = %v", err)
	}
	decoded := make([]int16, frameSamples*2)
	samples, err := decoder.DecodeToInt16(packet, decoded)
	if err != nil {
		t.Fatalf("DecodeToInt16() error = %v", err)
	}
	if samples != frameSamples {
		t.Fatalf("decoded samples = %d, want %d", samples, frameSamples)
	}
}

func newOutputProcessorForTest(t *testing.T) *OutputProcessor {
	t.Helper()
	encoder, err := NewFrameEncoder()
	if err != nil {
		t.Fatalf("NewFrameEncoder() error = %v", err)
	}
	t.Cleanup(func() {
		if err := encoder.Close(); err != nil {
			t.Errorf("FrameEncoder.Close() error = %v", err)
		}
	})
	processor, err := NewOutputProcessor(
		encoder,
		discardSampleWriter{},
		nil,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatalf("NewOutputProcessor() error = %v", err)
	}
	return processor
}

type discardSampleWriter struct{}

func (discardSampleWriter) WriteSample(pionmedia.Sample) error { return nil }

type timingSampleWriter struct {
	mu      sync.Mutex
	target  int
	times   []time.Time
	reached chan struct{}
	cancel  context.CancelFunc
}

func (w *timingSampleWriter) WriteSample(pionmedia.Sample) error {
	w.mu.Lock()
	w.times = append(w.times, time.Now())
	reached := len(w.times) == w.target
	w.mu.Unlock()
	if reached {
		close(w.reached)
		w.cancel()
	}
	return nil
}
