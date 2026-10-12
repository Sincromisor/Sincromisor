package input

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"testing"

	"github.com/pion/interceptor"
	mediaopus "github.com/pion/mediadevices/pkg/codec/opus"
	"github.com/pion/mediadevices/pkg/io/audio"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/mediadevices/pkg/wave"
	"github.com/pion/rtp"
)

func TestInputProcessorOpusToS16LEGolden(t *testing.T) {
	// 入力も固定し、実行環境ごとのlibopusエンコーダーを基準波形の比較から切り離す。
	data, err := os.ReadFile("testdata/opus_to_s16le.json")
	if err != nil {
		t.Fatal(err)
	}
	var tests []struct {
		Name    string   `json:"name"`
		Packets [][]byte `json:"packets"`
		PCM     []int16  `json:"pcm"`
	}
	if err := json.Unmarshal(data, &tests); err != nil {
		t.Fatal(err)
	}
	if len(tests) != 2 {
		t.Fatalf("golden cases = %d, want mono and stereo", len(tests))
	}
	for _, test := range tests {
		t.Run(test.Name, func(t *testing.T) {
			packets := opusRTPPackets(1, 0, test.Packets)
			reader := &countingPacketReader{packets: packets}
			frames := runInputFrames(t, context.Background(), reader)
			if len(frames) != 1 || len(frames[0]) != pcmFrameBytes {
				t.Fatalf("frames = %d x %d bytes, want 1 x %d", len(frames), frameLength(frames), pcmFrameBytes)
			}
			if len(reader.submitReads) != 1 || reader.submitReads[0] != 2 {
				t.Fatalf("submit read positions = %v, want [2] after two 10 ms packets", reader.submitReads)
			}
			gotSamples := decodeS16LE(frames[0])
			if len(test.PCM) != pcmFrameSamples {
				t.Fatalf("golden samples = %d, want %d", len(test.PCM), pcmFrameSamples)
			}
			// Pion Opusの融合積和の有無で、16-bit PCMに最大2 LSBの丸め差が生じる。
			// ハッシュ一致ではなく全標本を比較し、音量・順序・downmix・FIRの変化は検出する。
			const maxSampleDifference = 2
			for index, want := range test.PCM {
				difference := int(gotSamples[index]) - int(want)
				if difference < -maxSampleDifference || difference > maxSampleDifference {
					t.Fatalf("sample[%d] = %d, want %d ±%d", index, gotSamples[index], want, maxSampleDifference)
				}
			}
		})
	}
}

func TestInputProcessorSSRCChangeResetsCodecFIRPhaseAndFrameRemainder(t *testing.T) {
	oldPayload := encodeTestOpus(t, goldenMonoPCM(480), 1, mediaopus.Latency10ms)[0]
	newPayloads := encodeTestOpus(t, goldenStereoPCM(960), 2, mediaopus.Latency10ms)
	packets := append(
		[]*rtp.Packet{opusRTPPackets(10, 0, [][]byte{oldPayload})[0]},
		opusRTPPackets(20, 100, newPayloads)...,
	)
	reader := &countingPacketReader{packets: packets}
	got := runInputFrames(t, context.Background(), reader)
	fresh := runInputFrames(t, context.Background(), &countingPacketReader{
		packets: opusRTPPackets(20, 100, newPayloads),
	})
	if len(got) != 1 || len(fresh) != 1 {
		t.Fatalf("reset frames = %d, fresh frames = %d, want one each", len(got), len(fresh))
	}
	if reader.submitReads[0] != 3 {
		t.Fatalf("submit occurred after read %d, want 3; old 10 ms remainder must not complete new frame", reader.submitReads[0])
	}
	if fmt.Sprintf("%x", sha256.Sum256(got[0])) != fmt.Sprintf("%x", sha256.Sum256(fresh[0])) {
		t.Fatal("new SSRC frame differs from fresh decoder/FIR/phase/frame state")
	}
}

func TestInputProcessorDoesNotSubmitIncompletePCMAtEOFOrCancel(t *testing.T) {
	payload := encodeTestOpus(t, goldenMonoPCM(480), 1, mediaopus.Latency10ms)[0]
	t.Run("EOF", func(t *testing.T) {
		reader := &countingPacketReader{packets: opusRTPPackets(1, 0, [][]byte{payload})}
		if frames := runInputFrames(t, context.Background(), reader); len(frames) != 0 {
			t.Fatalf("submitted %d frames from 10 ms remainder at EOF, want 0", len(frames))
		}
	})
	t.Run("cancel after partial decode", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		reader := &cancelAfterPacketReader{packet: opusRTPPackets(1, 0, [][]byte{payload})[0], cancel: cancel}
		processor, err := New(&recordingInputObserver{})
		if err != nil {
			t.Fatalf("NewInputProcessor() error = %v", err)
		}
		submits := 0
		err = processor.Run(ctx, reader, func([]byte) error {
			submits++
			return nil
		})
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Run() error = %v, want context.Canceled", err)
		}
		if submits != 0 {
			t.Fatalf("submitted %d frames from 10 ms remainder at cancel, want 0", submits)
		}
	})
}

func runInputFrames(t *testing.T, ctx context.Context, reader *countingPacketReader) [][]byte {
	t.Helper()
	processor, err := New(&recordingInputObserver{})
	if err != nil {
		t.Fatalf("NewInputProcessor() error = %v", err)
	}
	var frames [][]byte
	err = processor.Run(ctx, reader, func(frame []byte) error {
		frames = append(frames, append([]byte(nil), frame...))
		reader.submitReads = append(reader.submitReads, reader.reads)
		return nil
	})
	if !errors.Is(err, io.EOF) {
		t.Fatalf("Run() error = %v, want io.EOF chain", err)
	}
	return frames
}

func encodeTestOpus(t *testing.T, pcm []int16, channels int, latency mediaopus.Latency) [][]byte {
	t.Helper()
	params, err := mediaopus.NewParams()
	if err != nil {
		t.Fatalf("NewParams() error = %v", err)
	}
	params.Latency = latency
	samplesPerFrame := int(latency.Duration()) * SampleRate / int(1e9)
	reader := &testPCMReader{pcm: pcm, channels: channels, samplesPerFrame: samplesPerFrame}
	encoder, err := params.BuildAudioEncoder(reader, prop.Media{Audio: prop.Audio{
		SampleRate: SampleRate, ChannelCount: channels,
	}})
	if err != nil {
		t.Fatalf("BuildAudioEncoder() error = %v", err)
	}
	defer func() {
		if err := encoder.Close(); err != nil {
			t.Errorf("encoder.Close() error = %v", err)
		}
	}()
	var payloads [][]byte
	for {
		payload, release, readErr := encoder.Read()
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			t.Fatalf("encoder.Read() error = %v", readErr)
		}
		payloads = append(payloads, append([]byte(nil), payload...))
		release()
	}
	return payloads
}

type testPCMReader struct {
	pcm             []int16
	channels        int
	samplesPerFrame int
	offset          int
}

func (r *testPCMReader) Read() (wave.Audio, func(), error) {
	if r.offset >= len(r.pcm) {
		return nil, nil, io.EOF
	}
	sampleCount := r.samplesPerFrame * r.channels
	end := r.offset + sampleCount
	if end > len(r.pcm) {
		return nil, nil, io.ErrUnexpectedEOF
	}
	data := append([]int16(nil), r.pcm[r.offset:end]...)
	r.offset = end
	return &wave.Int16Interleaved{
		Size: wave.ChunkInfo{Len: r.samplesPerFrame, Channels: r.channels, SamplingRate: SampleRate},
		Data: data,
	}, func() {}, nil
}

var _ audio.Reader = (*testPCMReader)(nil)

type countingPacketReader struct {
	packets     []*rtp.Packet
	reads       int
	submitReads []int
}

func (r *countingPacketReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	if len(r.packets) == 0 {
		return nil, nil, io.EOF
	}
	packet := r.packets[0]
	r.packets = r.packets[1:]
	r.reads++
	return packet, nil, nil
}

type cancelAfterPacketReader struct {
	packet *rtp.Packet
	cancel context.CancelFunc
	read   bool
}

func (r *cancelAfterPacketReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	if !r.read {
		r.read = true
		return r.packet, nil, nil
	}
	r.cancel()
	return nil, nil, context.Canceled
}

func opusRTPPackets(ssrc uint32, firstSequence uint16, payloads [][]byte) []*rtp.Packet {
	packets := make([]*rtp.Packet, len(payloads))
	for index, payload := range payloads {
		packets[index] = &rtp.Packet{
			Header: rtp.Header{
				SSRC: ssrc, SequenceNumber: firstSequence + uint16(index), Timestamp: uint32(index * 480),
			},
			Payload: payload,
		}
	}
	return packets
}

func goldenMonoPCM(samples int) []int16 {
	pcm := make([]int16, samples)
	for index := range pcm {
		pcm[index] = int16(math.Round(12000 * math.Sin(2*math.Pi*1000*float64(index)/SampleRate)))
	}
	return pcm
}

func goldenStereoPCM(samples int) []int16 {
	pcm := make([]int16, samples*2)
	for index := range samples {
		pcm[index*2] = int16(math.Round(12000 * math.Sin(2*math.Pi*1000*float64(index)/SampleRate)))
		pcm[index*2+1] = int16(math.Round(6000 * math.Sin(2*math.Pi*2000*float64(index)/SampleRate)))
	}
	return pcm
}

func decodeS16LE(frame []byte) []int16 {
	samples := make([]int16, len(frame)/2)
	for index := range samples {
		samples[index] = int16(binary.LittleEndian.Uint16(frame[index*2:]))
	}
	return samples
}

func frameLength(frames [][]byte) int {
	if len(frames) == 0 {
		return 0
	}
	return len(frames[0])
}
