// Package media はbrowser RTP/Opusのordering・PCM変換と1秒test toneのOpus encodeを担当する。
package media

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"sync"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/mediadevices/pkg/codec"
	mediaopus "github.com/pion/mediadevices/pkg/codec/opus"
	"github.com/pion/mediadevices/pkg/io/audio"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/mediadevices/pkg/wave"
	pionopus "github.com/pion/opus"
	"github.com/pion/rtp"
)

const (
	// SampleRate は WebRTC Opus の RTP clock と test PCM の sample rate を Hz で表す。
	SampleRate = 48000
	// FrameDuration は outbound encoder と RTP pacing が共有する Opus frame duration である。
	FrameDuration = 20 * time.Millisecond
	frameSamples  = SampleRate / 50
	toneSamples   = SampleRate
	toneFrequency = 440.0
	toneAmplitude = 0.25
	maxChannels   = 2
)

// RTPReader は Pion remote track から順次 RTP packet を読む境界である。
//
// PoC は packet reorder、NACK、PLC を行わず、reader が返した順序を decode 順序とする。
type RTPReader interface {
	ReadRTP() (*rtp.Packet, interceptor.Attributes, error)
}

// DecodeStats は browser 音声の decode 観測値を session log と smoke 判定へ渡す。
type DecodeStats struct {
	Packets       int
	Samples       int
	Channels      int
	SampleRate    int
	NonZeroSample int
}

// GenerateTestPCM は -12 dBFS 相当の 440 Hz、48 kHz mono、1 秒 PCM を生成する。
//
// binary fixture を持たず、同じ波形を unit test と browser 送信で共有する。返却 slice の 1 要素は
// signed 16-bit PCM の 1 sample であり、resample や channel conversion は行わない。
func GenerateTestPCM() []int16 {
	pcm := make([]int16, toneSamples)
	for index := range pcm {
		phase := 2 * math.Pi * toneFrequency * float64(index) / SampleRate
		pcm[index] = int16(math.Sin(phase) * toneAmplitude * math.MaxInt16)
	}
	return pcm
}

// ToneEncoder は mediadevices/libopus encoder と 1 秒 PCM の frame cursor を所有する。
//
// EncodeNext は 20 ms frame を 50 回返した後 io.EOF を返す。Close は native encoder を
// idempotent に解放し、session close が pacing goroutine と競合しても二重解放しない。
type ToneEncoder struct {
	mu      sync.Mutex
	encoder codec.ReadCloser
}

// NewToneEncoder は通常の static mediadevices Opus build で 48 kHz mono encoder を作成する。
//
// CGO toolchain または bundled static archive が利用できない場合は error を返す。dynamic build tag と
// system libopus fallback は使用しない。
func NewToneEncoder() (*ToneEncoder, error) {
	reader := newPCMReader(GenerateTestPCM())
	params, err := mediaopus.NewParams()
	if err != nil {
		return nil, fmt.Errorf("create opus params: %w", err)
	}
	params.Latency = mediaopus.Latency20ms
	encoder, err := params.BuildAudioEncoder(reader, prop.Media{Audio: prop.Audio{
		SampleRate:   SampleRate,
		ChannelCount: 1,
	}})
	if err != nil {
		return nil, fmt.Errorf("build opus encoder: %w", err)
	}
	return &ToneEncoder{encoder: encoder}, nil
}

// EncodeNext は test PCM の次の 20 ms Opus packet を返す。
//
// 返却 packet は呼び出し側が Pion track へ書き込むまで保持できる独立 slice である。
// test tone 終了時は io.EOF、encoder failure 時は文脈付き error を返す。
func (e *ToneEncoder) EncodeNext() ([]byte, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.encoder == nil {
		return nil, io.EOF
	}
	packet, release, err := e.encoder.Read()
	if err != nil {
		return nil, fmt.Errorf("encode opus frame: %w", err)
	}
	release()
	return append([]byte(nil), packet...), nil
}

// Close は encoder の native resource を一度だけ解放する。
func (e *ToneEncoder) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.encoder == nil {
		return nil
	}
	err := e.encoder.Close()
	e.encoder = nil
	if err != nil {
		return fmt.Errorf("close opus encoder: %w", err)
	}
	return nil
}

// DecodeRemote は RTP payload を pure Go Opus decoder で 48 kHz PCM に変換する。
//
// ctx cancellation、RTP read error、decode error のいずれかで終了する。packet は到着順に処理し、
// resample、reorder、loss concealmentを行わない低水準diagnostic契約である。production inboundは
// InputProcessorを使い、onProgressはこの関数内の累積stats snapshotだけを受ける。
func DecodeRemote(
	ctx context.Context,
	reader RTPReader,
	onProgress func(DecodeStats),
) error {
	decoder, err := pionopus.NewDecoderWithOutput(SampleRate, maxChannels)
	if err != nil {
		return fmt.Errorf("create opus decoder: %w", err)
	}
	stats := DecodeStats{Channels: maxChannels, SampleRate: SampleRate}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		packet, _, readErr := reader.ReadRTP()
		if readErr != nil {
			return fmt.Errorf("read opus rtp: %w", readErr)
		}
		// Chrome は Opus DTX 中に空 RTP payload を送る場合がある。音声frameではないためdecode対象外とし、
		// codec errorで正常なsessionを閉じず次のnon-empty packetを待つ。
		if len(packet.Payload) == 0 {
			continue
		}
		pcm := make([]int16, frameSamples*maxChannels*6)
		samplesPerChannel, decodeErr := decoder.DecodeToInt16(packet.Payload, pcm)
		if decodeErr != nil {
			return fmt.Errorf("decode opus packet: %w", decodeErr)
		}
		stats.Packets++
		stats.Samples += samplesPerChannel
		for _, sample := range pcm[:samplesPerChannel*maxChannels] {
			if sample != 0 {
				stats.NonZeroSample++
			}
		}
		if onProgress != nil {
			onProgress(stats)
		}
	}
}

type pcmReader struct {
	pcm    []int16
	offset int
}

func newPCMReader(pcm []int16) audio.Reader {
	return &pcmReader{pcm: pcm}
}

// Read は test PCM を encoder が要求する 20 ms frame 表現へ変換する。
//
// 最終 frame 後は io.EOF を返し、padding や loop は行わない。outbound pacing はこの reader ではなく
// session が所有する ticker で決定する。
func (r *pcmReader) Read() (wave.Audio, func(), error) {
	if r.offset >= len(r.pcm) {
		return nil, nil, io.EOF
	}
	end := r.offset + frameSamples
	if end > len(r.pcm) {
		return nil, nil, errors.New("test pcm is not aligned to 20 ms frames")
	}
	frame := append([]int16(nil), r.pcm[r.offset:end]...)
	r.offset = end
	return &wave.Int16Interleaved{
		Size: wave.ChunkInfo{Len: frameSamples, Channels: 1, SamplingRate: SampleRate},
		Data: frame,
	}, func() {}, nil
}
