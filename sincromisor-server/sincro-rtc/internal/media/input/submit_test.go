package input

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/pion/rtp"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

func TestInputProcessorSubmitPolicies(t *testing.T) {
	opusPacket := encodedTonePacket(t)
	tests := []struct {
		name       string
		submit     SubmitFunc
		wantEvent  []InputEvent
		wantFrames int
		wantError  string
	}{
		{name: "running", submit: func([]byte) error { return nil }, wantFrames: 1},
		{
			name: "pipeline unavailable",
			submit: func([]byte) error {
				return pipeline.ErrPipelineUnavailable
			},
			wantEvent:  []InputEvent{InputEventPipelineUnavailable},
			wantFrames: 1,
		},
		{
			name: "other submit error",
			submit: func([]byte) error {
				return errors.New("closed")
			},
			wantFrames: 1,
			wantError:  "submit pipeline PCM",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			observer := &recordingInputObserver{}
			processor, err := New(observer)
			if err != nil {
				t.Fatalf("NewInputProcessor() error = %v", err)
			}
			frames := 0
			err = processor.Run(
				context.Background(),
				&packetReader{packets: []*rtp.Packet{opusPacket.Clone()}, terminal: io.EOF},
				func(frame []byte) error {
					frames++
					if len(frame) != pcmFrameBytes {
						t.Fatalf("frame bytes = %d, want %d", len(frame), pcmFrameBytes)
					}
					return test.submit(frame)
				},
			)
			if test.wantError == "" && !errors.Is(err, io.EOF) {
				t.Fatalf("Run() error = %v, want io.EOF chain", err)
			}
			if test.wantError != "" && (err == nil || !strings.Contains(err.Error(), test.wantError)) {
				t.Fatalf("Run() error = %v, want containing %q", err, test.wantError)
			}
			if frames != test.wantFrames {
				t.Fatalf("submitted frames = %d, want %d", frames, test.wantFrames)
			}
			if !equalEvents(observer.events, test.wantEvent) {
				t.Fatalf("events = %v, want %v", observer.events, test.wantEvent)
			}
		})
	}
}

func TestInputProcessorDoesNotObserveCoordinatorQueueOverflow(t *testing.T) {
	encoder, err := NewToneEncoder()
	if err != nil {
		t.Fatalf("NewToneEncoder() error = %v", err)
	}
	defer func() {
		if err := encoder.Close(); err != nil {
			t.Errorf("encoder.Close() error = %v", err)
		}
	}()
	packets := make([]*rtp.Packet, 27)
	for index := range packets {
		payload, encodeErr := encoder.EncodeNext()
		if encodeErr != nil {
			t.Fatalf("EncodeNext(%d) error = %v", index, encodeErr)
		}
		packets[index] = &rtp.Packet{
			Header:  rtp.Header{SSRC: 1, SequenceNumber: uint16(index), Timestamp: uint32(index * 960)},
			Payload: payload,
		}
	}
	observer := &recordingInputObserver{}
	processor, err := New(observer)
	if err != nil {
		t.Fatalf("NewInputProcessor() error = %v", err)
	}
	coordinator := &overflowingCoordinator{}
	err = processor.Run(
		context.Background(),
		&packetReader{packets: packets, terminal: io.EOF},
		coordinator.SubmitPCM,
	)
	if !errors.Is(err, io.EOF) {
		t.Fatalf("Run() error = %v, want io.EOF chain", err)
	}
	if len(observer.events) != 0 {
		t.Fatalf("InputProcessor events = %v, want none for accepted Coordinator frames", observer.events)
	}
	if coordinator.overflows != 2 {
		t.Fatalf("Coordinator-owned overflows = %d, want 2", coordinator.overflows)
	}
}

func TestInputProcessorMalformedOpusAndObserverPanic(t *testing.T) {
	t.Run("malformed opus", func(t *testing.T) {
		processor, err := New(&recordingInputObserver{})
		if err != nil {
			t.Fatalf("NewInputProcessor() error = %v", err)
		}
		err = processor.Run(context.Background(), &packetReader{
			packets:  []*rtp.Packet{{Header: rtp.Header{SSRC: 1}, Payload: []byte{0xff}}},
			terminal: io.EOF,
		}, func([]byte) error { return nil })
		if err == nil || !strings.Contains(err.Error(), "decode opus packet") {
			t.Fatalf("Run() error = %v, want decode error", err)
		}
	})
	t.Run("observer panic", func(t *testing.T) {
		processor, err := New(panicInputObserver{})
		if err != nil {
			t.Fatalf("NewInputProcessor() error = %v", err)
		}
		err = processor.Run(context.Background(), &packetReader{
			packets:  []*rtp.Packet{dtxPacket(1, 0, 0)},
			terminal: io.EOF,
		}, func([]byte) error { return nil })
		if err == nil || !strings.Contains(err.Error(), "input observer panic") {
			t.Fatalf("Run() error = %v, want observer panic error", err)
		}
	})
}

func encodedTonePacket(t *testing.T) *rtp.Packet {
	t.Helper()
	encoder, err := NewToneEncoder()
	if err != nil {
		t.Fatalf("NewToneEncoder() error = %v", err)
	}
	t.Cleanup(func() {
		if err := encoder.Close(); err != nil {
			t.Errorf("encoder.Close() error = %v", err)
		}
	})
	payload, err := encoder.EncodeNext()
	if err != nil {
		t.Fatalf("EncodeNext() error = %v", err)
	}
	return &rtp.Packet{Header: rtp.Header{SSRC: 1}, Payload: payload}
}

type panicInputObserver struct{}

func (panicInputObserver) ObserveInputEvent(InputEvent) {
	panic("observer failed")
}

type overflowingCoordinator struct {
	frames    int
	overflows int
}

func (c *overflowingCoordinator) SubmitPCM([]byte) error {
	c.frames++
	if c.frames > 25 {
		c.overflows++
	}
	return nil
}
