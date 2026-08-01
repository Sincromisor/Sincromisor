package rtc

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
)

// installOutboundTrack はAnswer生成前にtest-tone trackとRTCP drain goroutineをsessionへ登録する。
//
// drainはPeerConnection.CloseでReadが解除され、SessionのWaitGroupへjoinされる。tone pacing自体は
// transport connectedまで開始せず、pipeline readinessとは独立したPoC出力として扱う。
func (s *Session) installOutboundTrack() error {
	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: audiomedia.SampleRate, Channels: 2},
		"pion-poc-tone",
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
	// RTCP feedback を drain しないと sender 側 interceptor が詰まるため、session context で reader を所有する。
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		buffer := make([]byte, 1500)
		for {
			if _, _, readErr := sender.Read(buffer); readErr != nil {
				return
			}
		}
	}()
	return nil
}

// startTone はbrowser inputから独立した20ms clockで有限test toneを送信する。
//
// session context、codec error、track write errorのいずれでも終了し、異常はSession.Closeへ集約する。
// tickerとgoroutineはSessionが所有し、cleanupのWaitGroupより後へ残さない。
func (s *Session) startTone(track *webrtc.TrackLocalStaticSample) {
	// Pacing は browser input 到着から独立させ、session context が ticker と encoder の終了を所有する。
	go func() {
		defer s.wg.Done()
		ticker := time.NewTicker(audiomedia.FrameDuration)
		defer ticker.Stop()
		for {
			select {
			case <-s.ctx.Done():
				return
			case <-ticker.C:
				packet, err := s.encoder.EncodeNext()
				if errors.Is(err, io.EOF) {
					s.logger.Info("outbound test tone completed", "session_id", s.id, "duration_ms", 1000)
					return
				}
				if err != nil {
					s.logger.Error("outbound opus encode failed", "session_id", s.id, "error", err)
					_ = s.Close("codec_error")
					return
				}
				if err := track.WriteSample(media.Sample{Data: packet, Duration: audiomedia.FrameDuration}); err != nil {
					s.logger.Error("outbound audio write failed", "session_id", s.id, "error", err)
					_ = s.Close("media_write_error")
					return
				}
			}
		}
	}()
}

// startInbound は受理済みの唯一のaudio trackをsession context配下のdecoderへ接続する。
//
// statsはlog/close summary用のsession累積値へ変換する。cancelと正常EOFは終了通知として扱い、
// decode failureだけをcodec_errorとして同じclose-onceへ戻す。
func (s *Session) startInbound(reader audiomedia.RTPReader) {
	go func() {
		defer s.wg.Done()
		err := audiomedia.DecodeRemote(s.ctx, reader, func(stats audiomedia.DecodeStats) {
			s.statsMu.Lock()
			s.stats = stats
			s.statsMu.Unlock()
			if stats.Packets == 100 {
				s.logger.Info("inbound opus smoke threshold reached",
					"session_id", s.id,
					"packets", stats.Packets,
					"sample_rate", stats.SampleRate,
					"channels", stats.Channels,
					"non_zero_samples", stats.NonZeroSample,
				)
			}
		})
		if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, io.EOF) {
			s.logger.Error("inbound opus decode stopped", "session_id", s.id, "error", err)
			_ = s.Close("codec_error")
		}
	}()
}

// rtpReader はPion TrackRemoteをmedia packageの最小RTPReader境界へ適合させる。
type rtpReader struct {
	track *webrtc.TrackRemote
}

func (r rtpReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	return r.track.ReadRTP()
}
