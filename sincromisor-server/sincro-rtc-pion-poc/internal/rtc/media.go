package rtc

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

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
	go func() {
		defer s.wg.Done()
		buffer := make([]byte, 1500)
		for {
			if _, _, readErr := sender.Read(buffer); readErr != nil {
				return
			}
		}
	}()
}

// startInbound は受理済みの唯一のaudio trackをsession context配下のInputProcessorへ接続する。
//
// acceptAudioTrackがWaitGroupを予約済みなので、ここでは追加しない。readerはreadiness前から開始し、
// Coordinator running前のframeはInputProcessorがunavailableとしてdropする。cancelと正常EOFは
// 終了通知、それ以外のdecode/submit/observer failureはmedia_errorとして同じclose-onceへ戻す。
func (s *Session) startInbound(reader audiomedia.RTPReader) {
	go func() {
		defer s.wg.Done()
		err := s.input.Run(s.ctx, reader, s.pipeline.SubmitPCM)
		if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, io.EOF) {
			s.logger.Error("inbound audio processing stopped", "session_id", s.id, "error", err)
			_ = s.Close("media_error")
		}
	}()
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
// SamplePosition/RTPTimestampはprocessor側のclock検証用であり、production trackはPionが
// Durationから同じ48 kHz RTP増分を生成する。
func (w pionSampleWriter) WriteSample(sample audiomedia.OutputSample) error {
	return w.track.WriteSample(media.Sample{
		Data: sample.MediaSample.Data, Duration: sample.MediaSample.Duration,
	})
}

func (r rtpReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	return r.track.ReadRTP()
}
