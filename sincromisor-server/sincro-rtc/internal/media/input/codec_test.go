package input

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
)

func TestGenerateTestPCM(t *testing.T) {
	pcm := GenerateTestPCM()
	if len(pcm) != SampleRate {
		t.Fatalf("len(pcm) = %d, want %d", len(pcm), SampleRate)
	}
	nonZero := 0
	for _, sample := range pcm {
		if sample != 0 {
			nonZero++
		}
	}
	if nonZero == 0 {
		t.Fatal("generated PCM is silent")
	}
}

func TestToneEncoderProducesTwentyMillisecondFrames(t *testing.T) {
	encoder, err := NewToneEncoder()
	if err != nil {
		t.Fatalf("NewToneEncoder() error = %v", err)
	}
	defer func() {
		if err := encoder.Close(); err != nil {
			t.Errorf("Close() error = %v", err)
		}
	}()

	var packets [][]byte
	for {
		packet, encodeErr := encoder.EncodeNext()
		if errors.Is(encodeErr, io.EOF) {
			break
		}
		if encodeErr != nil {
			t.Fatalf("EncodeNext() error = %v", encodeErr)
		}
		if len(packet) == 0 {
			t.Fatal("EncodeNext() returned empty Opus packet")
		}
		packets = append(packets, packet)
	}
	if len(packets) != int((1e9)/(testFrameDuration.Nanoseconds())) {
		t.Fatalf("packet count = %d, want 50", len(packets))
	}
}

func TestDecodeRemoteProducesNonSilentPCM(t *testing.T) {
	encoder, err := NewToneEncoder()
	if err != nil {
		t.Fatalf("NewToneEncoder() error = %v", err)
	}
	packet, err := encoder.EncodeNext()
	if err != nil {
		t.Fatalf("EncodeNext() error = %v", err)
	}
	if err := encoder.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	reader := &packetReader{
		packets:  []*rtp.Packet{{Payload: nil}, {Payload: packet}},
		terminal: io.EOF,
	}
	var got DecodeStats
	err = DecodeRemote(context.Background(), reader, func(stats DecodeStats) {
		got = stats
	})
	if !errors.Is(err, io.EOF) {
		t.Fatalf("DecodeRemote() error = %v, want io.EOF chain", err)
	}
	if got.Packets != 1 || got.SampleRate != SampleRate || got.Channels != 2 {
		t.Fatalf("stats = %+v, want one 48 kHz decoded packet", got)
	}
	if got.NonZeroSample == 0 {
		t.Fatal("decoded PCM is silent")
	}
}

func TestDecodeRemoteStopsOnCodecError(t *testing.T) {
	reader := &packetReader{packets: []*rtp.Packet{{Payload: []byte{0xff}}}, terminal: io.EOF}
	if err := DecodeRemote(context.Background(), reader, nil); err == nil {
		t.Fatal("DecodeRemote() error = nil, want malformed Opus error")
	}
}

type packetReader struct {
	packets  []*rtp.Packet
	terminal error
}

func (r *packetReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	if len(r.packets) == 0 {
		return nil, nil, r.terminal
	}
	packet := r.packets[0]
	r.packets = r.packets[1:]
	return packet, nil, nil
}
