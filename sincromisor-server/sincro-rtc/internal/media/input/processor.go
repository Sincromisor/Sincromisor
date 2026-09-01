// Package input はブラウザーのRTP/Opusを並べ替え、16 kHz mono PCMへ変換する。
package input

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"

	pionopus "github.com/pion/opus"
	"github.com/pion/rtp"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

const (
	// SampleRate はWebRTC OpusのRTP clockと復号出力の周波数をHzで表す。
	SampleRate           = 48000
	maxChannels          = 2
	reorderWindowPackets = uint64(64)
	pcmFrameSamples      = 320
	pcmFrameBytes        = pcmFrameSamples * 2
	maxOpusFrameSamples  = SampleRate * 120 / 1000
)

// SubmitFuncは20 ms / 16 kHz / mono / s16leの1 frameをCoordinator境界へ渡す。
type SubmitFunc func([]byte) error

// ProcessorはRTPを並べ替え、browser OpusをCoordinatorのPCM契約へ変換する。
//
// 中間queueを持たず、bounded ordering後にdecode、downsample、frame化、SubmitFuncを同期実行する。
// observerはprocess共有だがPCMやpacket payloadを受け取らない。
type Processor struct {
	observer Observer
}

// Newは全破棄判断で使うobserverを検証して保持し、nilならerrorを返す。
func New(observer Observer) (*Processor, error) {
	if observer == nil {
		return nil, errors.New("input observer must not be nil")
	}
	return &Processor{observer: observer}, nil
}

// Runは1本のremote RTP readerをcancel、EOF、read/decode/submit failureのいずれかまで処理する。
//
// RTP sequenceを単調増加値へunwrapし、[next,next+63]内を並べ替える。SSRC変更時は旧streamの
// 連続prefixだけを送出し、最初のgap以後を破棄してdecoder/FIR/frame stateをresetする。
// 空DTXは観測だけしてdecodeせず、ErrPipelineUnavailableは再送せずframeを破棄する。
// その他のsubmit errorとmalformed non-empty Opusはcallerへ返す。
func (p *Processor) Run(ctx context.Context, reader RTPReader, submit SubmitFunc) (runErr error) {
	if ctx == nil || reader == nil || submit == nil {
		return errors.New("input processor arguments must not be nil")
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			runErr = fmt.Errorf("input observer panic: %v", recovered)
		}
	}()

	var stream *inputStream
	for {
		if err := ctx.Err(); err != nil {
			if stream != nil {
				stream.dropBuffered(p.observer)
			}
			return err
		}
		packet, _, err := reader.ReadRTP()
		if err != nil {
			if stream != nil {
				if errors.Is(err, io.EOF) {
					if flushErr := stream.flushPrefix(ctx, p.observer, submit); flushErr != nil {
						stream.dropBuffered(p.observer)
						return flushErr
					}
				}
				stream.dropBuffered(p.observer)
			}
			return fmt.Errorf("read opus rtp: %w", err)
		}
		if packet == nil {
			return errors.New("read opus rtp returned nil packet")
		}
		if stream == nil || stream.ssrc != packet.SSRC {
			if stream != nil {
				if err := stream.flushPrefix(ctx, p.observer, submit); err != nil {
					stream.dropBuffered(p.observer)
					return err
				}
				stream.dropBuffered(p.observer)
			}
			stream, err = newInputStream(packet.SSRC, packet.SequenceNumber, packet.Timestamp)
			if err != nil {
				return err
			}
		}
		if err := stream.accept(ctx, packet, p.observer, submit); err != nil {
			stream.dropBuffered(p.observer)
			return err
		}
	}
}

type orderedPacket struct {
	packet            *rtp.Packet
	extendedTimestamp uint64
}

// inputStreamはbrowserのSSRC変更時に一括破棄すべきordering/codec/変換stateを保持する。
type inputStream struct {
	ssrc          uint32
	next          uint64
	timestampNext uint64
	buffered      map[uint64]orderedPacket
	recent        map[uint64]struct{}
	decoder       pionopus.Decoder
	resampler     streamingResampler
	framed        []int16
}

// newInputStreamは新SSRCの最初のsequence/timestampをunwrap基準にし、codecと変換stateを初期化する。
func newInputStream(ssrc uint32, sequence uint16, timestamp uint32) (*inputStream, error) {
	decoder, err := pionopus.NewDecoderWithOutput(SampleRate, maxChannels)
	if err != nil {
		return nil, fmt.Errorf("create opus decoder: %w", err)
	}
	return &inputStream{
		ssrc: ssrc,
		// 先頭に1 epoch置くことで、初期値が小さい場合も直前packetをunsigned underflowなしで
		// late分類できる。通常のwrapは次epochへの単調増加として扱う。
		next:          uint64(sequence) + 1<<16,
		timestampNext: uint64(timestamp) + 1<<32,
		buffered:      make(map[uint64]orderedPacket),
		recent:        make(map[uint64]struct{}),
		decoder:       decoder,
	}, nil
}

// acceptはcodec stateを変更する前に、1 packetをbounded window上でduplicate/late/受理へ分類する。
func (s *inputStream) accept(
	ctx context.Context,
	packet *rtp.Packet,
	observer Observer,
	submit SubmitFunc,
) error {
	sequence := unwrap16(packet.SequenceNumber, s.next)
	if _, exists := s.buffered[sequence]; exists {
		observer.ObserveInputEvent(InputEventDuplicate)
		return nil
	}
	if sequence < s.next {
		if _, duplicate := s.recent[sequence]; duplicate {
			observer.ObserveInputEvent(InputEventDuplicate)
		} else {
			observer.ObserveInputEvent(InputEventLate)
		}
		return nil
	}
	for sequence >= s.next+reorderWindowPackets {
		observer.ObserveInputEvent(InputEventMissing)
		s.next++
		if err := s.flushPrefix(ctx, observer, submit); err != nil {
			return err
		}
	}
	cloned := packet.Clone()
	s.buffered[sequence] = orderedPacket{
		packet:            cloned,
		extendedTimestamp: unwrap32(packet.Timestamp, s.timestampNext),
	}
	return s.flushPrefix(ctx, observer, submit)
}

// flushPrefixはnextからの連続packetだけを取り出し、decoder、FIR、output framing stateを変更する唯一の経路である。
func (s *inputStream) flushPrefix(ctx context.Context, observer Observer, submit SubmitFunc) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		ordered, exists := s.buffered[s.next]
		if !exists {
			return nil
		}
		delete(s.buffered, s.next)
		if err := s.decode(ordered.packet.Payload, observer, submit); err != nil {
			return err
		}
		s.timestampNext = ordered.extendedTimestamp
		s.remember(s.next)
		s.next++
	}
}

// rememberは送出済みwindowだけを保持し、同じsequenceの再到着をlateではなくduplicateへ分類できるようにする。
func (s *inputStream) remember(sequence uint64) {
	s.recent[sequence] = struct{}{}
	if sequence >= reorderWindowPackets {
		delete(s.recent, sequence-reorderWindowPackets)
	}
}

// dropBufferedはgap以後の各packetを1件ずつ観測して破棄し、未完成PCMもstream終了とともに解放する。
func (s *inputStream) dropBuffered(observer Observer) {
	for range s.buffered {
		observer.ObserveInputEvent(InputEventBufferedDrop)
	}
	clear(s.buffered)
	s.framed = nil
}

// decodeはordered Opusを48 kHz stereo decode、mono downmix、FIR、20 ms framingの順に変換する。
func (s *inputStream) decode(payload []byte, observer Observer, submit SubmitFunc) error {
	if len(payload) == 0 {
		observer.ObserveInputEvent(InputEventDTX)
		return nil
	}
	pcm := make([]int16, maxOpusFrameSamples*maxChannels)
	samplesPerChannel, err := s.decoder.DecodeToInt16(payload, pcm)
	if err != nil {
		observeInputCodecError(observer)
		return fmt.Errorf("decode opus packet: %w", err)
	}
	mono := downmixStereo(pcm[:samplesPerChannel*maxChannels])
	s.framed = append(s.framed, s.resampler.process(mono)...)
	for len(s.framed) >= pcmFrameSamples {
		frame := make([]byte, pcmFrameBytes)
		for index, sample := range s.framed[:pcmFrameSamples] {
			binary.LittleEndian.PutUint16(frame[index*2:], uint16(sample))
		}
		s.framed = s.framed[pcmFrameSamples:]
		if err := submit(frame); err != nil {
			if errors.Is(err, pipeline.ErrPipelineUnavailable) {
				observer.ObserveInputEvent(InputEventPipelineUnavailable)
				continue
			}
			return fmt.Errorf("submit pipeline PCM: %w", err)
		}
		observeAcceptedInput(observer)
	}
	return nil
}

// downmixStereoはint16 overflowを避けるためint32で平均し、full-scaleの左右反相もzeroへ相殺する。
//
// Opus decoderはmono bitstreamを設定済みstereo outputへ複製するため、ordering層でcodec modeを
// parseせず同じ処理によりmono sampleをそのまま維持できる。
func downmixStereo(interleaved []int16) []int16 {
	mono := make([]int16, len(interleaved)/maxChannels)
	for index := range mono {
		left := int32(interleaved[index*maxChannels])
		right := int32(interleaved[index*maxChannels+1])
		mono[index] = int16((left + right) / 2)
	}
	return mono
}

// unwrap16はreferenceに最も近い16-bit sequenceのepochを選び、wrapを通常の単調増加へ変換する。
func unwrap16(value uint16, reference uint64) uint64 {
	delta := int64(int16(value - uint16(reference)))
	return uint64(int64(reference) + delta)
}

// unwrap32はreferenceに最も近い32-bit RTP timestampのepochを選び、wrapでstreamをresetしない。
func unwrap32(value uint32, reference uint64) uint64 {
	delta := int64(int32(value - uint32(reference)))
	return uint64(int64(reference) + delta)
}
