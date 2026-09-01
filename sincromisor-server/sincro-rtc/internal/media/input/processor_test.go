package input

import (
	"context"
	"errors"
	"io"
	"math"
	"testing"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
)

func TestNewRejectsNilObserver(t *testing.T) {
	if _, err := New(nil); err == nil {
		t.Fatal("New(nil) error = nil")
	}
}

func TestInputProcessorOrderingAndTelemetry(t *testing.T) {
	tests := []struct {
		name    string
		packets []*rtp.Packet
		want    []InputEvent
	}{
		{
			name: "reorder",
			packets: []*rtp.Packet{
				dtxPacket(1, 0, math.MaxUint32-959),
				dtxPacket(1, 2, 960),
				dtxPacket(1, 1, 0),
			},
			want: []InputEvent{InputEventDTX, InputEventDTX, InputEventDTX},
		},
		{
			name:    "duplicate emitted",
			packets: []*rtp.Packet{dtxPacket(1, 10, 0), dtxPacket(1, 10, 0)},
			want:    []InputEvent{InputEventDTX, InputEventDuplicate},
		},
		{
			name:    "duplicate buffered",
			packets: []*rtp.Packet{dtxPacket(1, 10, 0), dtxPacket(1, 12, 1920), dtxPacket(1, 12, 1920)},
			want:    []InputEvent{InputEventDTX, InputEventDuplicate, InputEventBufferedDrop},
		},
		{
			name:    "late",
			packets: []*rtp.Packet{dtxPacket(1, 10, 0), dtxPacket(1, 9, math.MaxUint32-959)},
			want:    []InputEvent{InputEventDTX, InputEventLate},
		},
		{
			name:    "next plus 63 remains buffered without missing",
			packets: []*rtp.Packet{dtxPacket(1, 0, 0), dtxPacket(1, 64, 64*960)},
			want:    []InputEvent{InputEventDTX, InputEventBufferedDrop},
		},
		{
			name:    "next plus 64 confirms missing",
			packets: []*rtp.Packet{dtxPacket(1, 0, 0), dtxPacket(1, 65, 65*960)},
			want:    []InputEvent{InputEventDTX, InputEventMissing, InputEventBufferedDrop},
		},
		{
			name: "packet after confirmed missing is late",
			packets: []*rtp.Packet{
				dtxPacket(1, 0, 0), dtxPacket(1, 65, 65*960), dtxPacket(1, 1, 960),
			},
			want: []InputEvent{
				InputEventDTX, InputEventMissing, InputEventLate, InputEventBufferedDrop,
			},
		},
		{
			name:    "sequence wrap",
			packets: []*rtp.Packet{dtxPacket(1, math.MaxUint16, math.MaxUint32-479), dtxPacket(1, 0, 480)},
			want:    []InputEvent{InputEventDTX, InputEventDTX},
		},
		{
			name: "ssrc reset drops old gap",
			packets: []*rtp.Packet{
				dtxPacket(1, 0, 0),
				dtxPacket(1, 2, 1920),
				dtxPacket(2, 50, 0),
			},
			want: []InputEvent{InputEventDTX, InputEventBufferedDrop, InputEventDTX},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			observer := &recordingInputObserver{}
			processor, err := New(observer)
			if err != nil {
				t.Fatalf("NewInputProcessor() error = %v", err)
			}
			reader := &packetReader{packets: test.packets, terminal: io.EOF}
			err = processor.Run(context.Background(), reader, func([]byte) error { return nil })
			if !errors.Is(err, io.EOF) {
				t.Fatalf("Run() error = %v, want io.EOF chain", err)
			}
			if !equalEvents(observer.events, test.want) {
				t.Fatalf("events = %v, want %v", observer.events, test.want)
			}
		})
	}
}

func TestInputProcessorCancellationDropsBufferedWithoutDecode(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	observer := &recordingInputObserver{}
	processor, err := New(observer)
	if err != nil {
		t.Fatalf("NewInputProcessor() error = %v", err)
	}
	reader := &cancelingPacketReader{
		cancel: cancel,
		packets: []*rtp.Packet{
			dtxPacket(1, 0, 0),
			dtxPacket(1, 2, 1920),
		},
	}
	err = processor.Run(ctx, reader, func([]byte) error {
		t.Fatal("SubmitFunc called after cancellation")
		return nil
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	if want := []InputEvent{InputEventDTX, InputEventBufferedDrop}; !equalEvents(observer.events, want) {
		t.Fatalf("events = %v, want %v", observer.events, want)
	}
}

func TestRTPUnwrapContinuesAcrossSequenceAndTimestampWrap(t *testing.T) {
	sequenceReference := uint64(1<<16 + math.MaxUint16)
	if got := unwrap16(0, sequenceReference); got != sequenceReference+1 {
		t.Fatalf("unwrap16(0) = %d, want %d", got, sequenceReference+1)
	}
	timestampReference := uint64(1<<32 + math.MaxUint32 - 479)
	if got := unwrap32(480, timestampReference); got != timestampReference+960 {
		t.Fatalf("unwrap32(480) = %d, want %d", got, timestampReference+960)
	}
}

func TestInputCounterObserverSnapshot(t *testing.T) {
	observer := NewCounterObserver()
	for _, event := range []InputEvent{
		InputEventDuplicate, InputEventLate, InputEventMissing, InputEventBufferedDrop,
		InputEventDTX, InputEventPipelineUnavailable,
	} {
		observer.ObserveInputEvent(event)
	}
	if got := observer.Snapshot(); got != (EventCounts{
		Duplicate: 1, Late: 1, Missing: 1, BufferedDrop: 1, DTX: 1, PipelineUnavailable: 1,
	}) {
		t.Fatalf("Snapshot() = %+v", got)
	}
}

func dtxPacket(ssrc uint32, sequence uint16, timestamp uint32) *rtp.Packet {
	return &rtp.Packet{Header: rtp.Header{
		SSRC: ssrc, SequenceNumber: sequence, Timestamp: timestamp,
	}}
}

type recordingInputObserver struct {
	events []InputEvent
}

func (o *recordingInputObserver) ObserveInputEvent(event InputEvent) {
	o.events = append(o.events, event)
}

type cancelingPacketReader struct {
	cancel  context.CancelFunc
	packets []*rtp.Packet
}

func (r *cancelingPacketReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	if len(r.packets) == 0 {
		return nil, nil, io.EOF
	}
	packet := r.packets[0]
	r.packets = r.packets[1:]
	if len(r.packets) == 0 {
		r.cancel()
	}
	return packet, nil, nil
}

func equalEvents(got, want []InputEvent) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}
