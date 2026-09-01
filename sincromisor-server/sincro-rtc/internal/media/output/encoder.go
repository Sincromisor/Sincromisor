package output

import (
	"errors"
	"fmt"
	"io"
	"sync"

	"github.com/pion/mediadevices/pkg/codec"
	mediaopus "github.com/pion/mediadevices/pkg/codec/opus"
	"github.com/pion/mediadevices/pkg/io/audio"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/mediadevices/pkg/wave"
)

// Encoder は連続する48 kHz mono PCM frameを同一Opus codec stateでencodeする。
//
// Encodeは必ず960 sampleを要求する。Closeはnative encoderを一度だけ解放し、Encodeとの競合を
// mutexで直列化する。zero valueは使用できない。
type Encoder struct {
	mu      sync.Mutex
	reader  *singleFrameReader
	encoder codec.ReadCloser
}

// NewEncoder は20 ms latencyの48 kHz mono Opus encoderを作る。
func NewEncoder() (*Encoder, error) {
	reader := &singleFrameReader{}
	params, err := mediaopus.NewParams()
	if err != nil {
		return nil, fmt.Errorf("create opus params: %w", err)
	}
	params.Latency = mediaopus.Latency20ms
	encoder, err := params.BuildAudioEncoder(reader, prop.Media{Audio: prop.Audio{
		SampleRate: SampleRate, ChannelCount: 1,
	}})
	if err != nil {
		return nil, fmt.Errorf("build outbound opus encoder: %w", err)
	}
	return &Encoder{reader: reader, encoder: encoder}, nil
}

// Encode は1つの20 ms PCM frameをOpus packetへ変換する。
func (e *Encoder) Encode(frame []int16) ([]byte, error) {
	if len(frame) != frameSamples {
		return nil, fmt.Errorf("outbound PCM frame must contain %d samples", frameSamples)
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.encoder == nil {
		return nil, io.EOF
	}
	e.reader.frame = append(e.reader.frame[:0], frame...)
	packet, release, err := e.encoder.Read()
	if err != nil {
		return nil, fmt.Errorf("encode outbound opus frame: %w", err)
	}
	release()
	return append([]byte(nil), packet...), nil
}

// Close はnative Opus resourceをidempotentに解放する。
func (e *Encoder) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.encoder == nil {
		return nil
	}
	err := e.encoder.Close()
	e.encoder = nil
	if err != nil {
		return fmt.Errorf("close outbound opus encoder: %w", err)
	}
	return nil
}

type singleFrameReader struct {
	frame []int16
}

func (r *singleFrameReader) Read() (wave.Audio, func(), error) {
	if len(r.frame) != frameSamples {
		return nil, nil, errors.New("outbound PCM frame is unavailable")
	}
	frame := append([]int16(nil), r.frame...)
	return &wave.Int16Interleaved{
		Size: wave.ChunkInfo{Len: frameSamples, Channels: 1, SamplingRate: SampleRate},
		Data: frame,
	}, func() {}, nil
}

var _ audio.Reader = (*singleFrameReader)(nil)
