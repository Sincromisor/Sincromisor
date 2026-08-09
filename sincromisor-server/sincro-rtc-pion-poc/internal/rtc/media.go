package rtc

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
)

// installOutboundTrack はAnswer生成前に継続outbound audio trackとRTCP senderをsessionへ登録する。
//
// transport未始動のsender.ReadはPeerConnection.Closeで解除されない場合があるため、RTCP drainと
// output pacingはconnected callback後にだけ開始する。これによりgather timeout sessionはgoroutineを持たない。
func (s *Session) installOutboundTrack() error {
	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: audiomedia.SampleRate, Channels: 2},
		"sincromisor-voice",
		"pion-poc",
	)
	if err != nil {
		return fmt.Errorf("create outbound audio track: %w", err)
	}
	sender, err := s.pc.AddTrack(track)
	if err != nil {
		return fmt.Errorf("add outbound audio track: %w", err)
	}
	s.outboundTrack = track
	s.outboundSender = sender
	return nil
}

// startRTCPDrain はconnected senderのfeedbackを読み、interceptor backpressureを解消する。
//
// connected後はPeerConnection.CloseがReadを解除する。goroutineはtransportReadyがlifecycle mutex内で
// WaitGroup予約した後に開始し、cleanupは解除とjoinを同じSession ownershipで完了する。
func (s *Session) startRTCPDrain(sender *webrtc.RTPSender) {
	s.goReserved("rtcp_reader", func(context.Context) {
		buffer := make([]byte, 1500)
		for {
			n, _, readErr := sender.Read(buffer)
			if readErr != nil {
				if s.ctx.Err() == nil {
					s.logger.Error("rtcp reader stopped", "session_id", s.id, "reason", "media_read_error")
					_ = s.Close("media_read_error")
				}
				return
			}
			packets, err := rtcp.Unmarshal(buffer[:n])
			if err != nil {
				s.metrics().RTCPFeedback("other")
				continue
			}
			s.recordRTCPPackets(packets, time.Now())
		}
	})
}

// recordRTCPPackets converts feedback into finite packet classes and Receiver
// Report quality samples. RTT uses RFC 3550 middle-32-bit NTP arithmetic; reports
// without an LSR still contribute loss but deliberately omit RTT.
func (s *Session) recordRTCPPackets(packets []rtcp.Packet, now time.Time) {
	for _, packet := range packets {
		switch typed := packet.(type) {
		case *rtcp.SenderReport:
			s.metrics().RTCPFeedback("sr")
		case *rtcp.ReceiverReport:
			s.metrics().RTCPFeedback("rr")
			for _, report := range typed.Reports {
				rtt := -1.0
				if report.LastSenderReport != 0 {
					// RFC 3550 compact NTP values wrap at 32 bits. Unsigned
					// subtraction preserves the elapsed interval across that wrap.
					elapsed := ntpMiddle32(now) - report.LastSenderReport - report.Delay
					rtt = float64(elapsed) / 65536
				}
				s.metrics().RTCPQuality(float64(report.FractionLost)/256, rtt)
			}
		case *rtcp.TransportLayerNack:
			s.metrics().RTCPFeedback("nack")
		default:
			s.metrics().RTCPFeedback("other")
		}
	}
}

func ntpMiddle32(value time.Time) uint32 {
	const ntpEpochOffset = uint64(2208988800)
	seconds := uint64(value.Unix()) + ntpEpochOffset
	fraction := uint64(value.Nanosecond()) * (uint64(1) << 32) / uint64(time.Second)
	return uint32((seconds<<16 | fraction>>16) & 0xffffffff)
}

// startInbound は受理済みの唯一のaudio trackをsession context配下のInputProcessorへ接続する。
//
// acceptAudioTrackがWaitGroupを予約済みなので、ここでは追加しない。readerはreadiness前から開始し、
// Coordinator running前のframeはInputProcessorがunavailableとしてdropする。cancelは終了通知だけとし、
// 正常EOFはbrowser側入力の終了としてnormal closeへ集約する。decode/submit/observer failureは
// media_errorとして同じclose-onceへ戻す。
func (s *Session) startInbound(reader audiomedia.RTPReader) {
	s.goReserved("inbound_processor", func(context.Context) {
		err := s.input.Run(s.ctx, reader, s.pipeline.SubmitPCM)
		switch {
		case errors.Is(err, io.EOF):
			_ = s.Close("normal")
		case err != nil && !errors.Is(err, context.Canceled):
			s.logger.Error("inbound audio processing stopped", "session_id", s.id, "reason", "media_read_error")
			_ = s.Close("media_error")
		}
	})
}

// rtpReader はPion TrackRemoteをmedia packageの最小RTPReader境界へ適合させる。
type rtpReader struct {
	track *webrtc.TrackRemote
}

type pionSampleWriter struct {
	track *webrtc.TrackLocalStaticSample
}

// WriteSampleは論理clock付きsampleをPionのduration駆動packetizerへ渡す。
//
// 通常frameはDurationから960 timestamp tick進む。期限切れslotがあるframeは
// MediaSample.PrevDroppedPacketsを保持したまま渡し、Pionにtimestampとsequence numberをskipさせる。
// SamplePosition/RTPTimestampはprocessor側の64/32 bit clock検証用である。
func (w pionSampleWriter) WriteSample(sample audiomedia.OutputSample) error {
	return w.track.WriteSample(sample.MediaSample)
}

func (r rtpReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	return r.track.ReadRTP()
}
