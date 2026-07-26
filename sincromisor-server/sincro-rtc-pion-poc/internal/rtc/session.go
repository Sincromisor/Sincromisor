// Package rtc は Pion PeerConnection と session registry の lifecycle を所有する。
package rtc

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
)

// Session は 1 PeerConnection とそこから開始した codec / media goroutine を所有する。
//
// Close は sync.Once で全終了経路を統合する。cancel、PeerConnection close、codec close、goroutine
// join、registry remove の順序を保ち、callback と graceful shutdown の競合を idempotent にする。
type Session struct {
	id       string
	pc       *webrtc.PeerConnection
	logger   *slog.Logger
	onClosed func(string)

	ctx           context.Context
	cancel        context.CancelFunc
	closeOnce     sync.Once
	startToneOnce sync.Once
	wg            sync.WaitGroup
	encoder       *audiomedia.ToneEncoder
	done          chan struct{}

	statsMu sync.Mutex
	stats   audiomedia.DecodeStats
}

func newSession(
	id string,
	configuration webrtc.Configuration,
	logger *slog.Logger,
	onClosed func(string),
) (*Session, error) {
	pc, err := webrtc.NewPeerConnection(configuration)
	if err != nil {
		return nil, fmt.Errorf("create peer connection: %w", err)
	}
	encoder, err := audiomedia.NewToneEncoder()
	if err != nil {
		_ = pc.Close()
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	session := &Session{
		id:       id,
		pc:       pc,
		logger:   logger,
		onClosed: onClosed,
		ctx:      ctx,
		cancel:   cancel,
		encoder:  encoder,
		done:     make(chan struct{}),
	}
	if err := session.installOutboundTrack(); err != nil {
		_ = session.Close("setup_failed")
		return nil, err
	}
	session.installCallbacks()
	logger.Info("rtc session created", "session_id", id)
	return session, nil
}

func (s *Session) negotiate(ctx context.Context, offerSDP string) (webrtc.SessionDescription, error) {
	if err := s.pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}); err != nil {
		return webrtc.SessionDescription{}, fmt.Errorf("set remote offer: %w", err)
	}
	answer, err := s.pc.CreateAnswer(nil)
	if err != nil {
		return webrtc.SessionDescription{}, fmt.Errorf("create answer: %w", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(s.pc)
	if err := s.pc.SetLocalDescription(answer); err != nil {
		return webrtc.SessionDescription{}, fmt.Errorf("set local answer: %w", err)
	}
	// Frontend に server-candidate endpoint を追加しないため、local candidates を SDP に集約して返す。
	select {
	case <-ctx.Done():
		return webrtc.SessionDescription{}, ctx.Err()
	case <-gatherComplete:
	}
	local := s.pc.LocalDescription()
	if local == nil {
		return webrtc.SessionDescription{}, errors.New("local answer is unavailable")
	}
	return *local, nil
}

func (s *Session) addCandidate(candidate webrtc.ICECandidateInit) error {
	if err := s.ctx.Err(); err != nil {
		return err
	}
	if err := s.pc.AddICECandidate(candidate); err != nil {
		return fmt.Errorf("add ice candidate: %w", err)
	}
	return nil
}

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
	s.startToneOnce = sync.Once{}
	s.pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateConnected {
			s.startToneOnce.Do(func() { s.startTone(track) })
		}
	})
	return nil
}

func (s *Session) startTone(track *webrtc.TrackLocalStaticSample) {
	// Pacing は browser input 到着から独立させ、session context が ticker と encoder の終了を所有する。
	s.wg.Add(1)
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

func (s *Session) installCallbacks() {
	s.pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		s.logger.Info("ice state changed", "session_id", s.id, "state", state.String())
		switch state {
		case webrtc.ICEConnectionStateClosed, webrtc.ICEConnectionStateFailed,
			webrtc.ICEConnectionStateDisconnected:
			_ = s.Close("ice_" + state.String())
		default:
		}
	})
	s.pc.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		if track.Kind() != webrtc.RTPCodecTypeAudio ||
			!strings.EqualFold(track.Codec().MimeType, webrtc.MimeTypeOpus) {
			s.logger.Error("unexpected remote track", "session_id", s.id, "mime_type", track.Codec().MimeType)
			_ = s.Close("unexpected_track")
			return
		}
		s.startInbound(rtpReader{track})
	})
	s.pc.OnDataChannel(s.handleDataChannel)
}

func (s *Session) startInbound(reader audiomedia.RTPReader) {
	s.wg.Add(1)
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

// Close は session の全 resource を idempotent に終了する。
//
// cancel を先に通知し、PeerConnection を閉じて blocking Read を解除し、native encoder を解放する。
// callback 内から呼ばれる場合があるため goroutine join は非同期 cleanup で行い、完了後 registry から削除する。
func (s *Session) Close(reason string) error {
	var closeErr error
	s.closeOnce.Do(func() {
		s.cancel()
		closeErr = errors.Join(closeErr, s.pc.Close(), s.encoder.Close())
		go func() {
			s.wg.Wait()
			s.statsMu.Lock()
			stats := s.stats
			s.statsMu.Unlock()
			s.onClosed(s.id)
			close(s.done)
			s.logger.Info("rtc session closed",
				"session_id", s.id,
				"reason", reason,
				"inbound_packets", stats.Packets,
				"non_zero_samples", stats.NonZeroSample,
			)
		}()
	})
	return closeErr
}

type rtpReader struct {
	track *webrtc.TrackRemote
}

func (r rtpReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	return r.track.ReadRTP()
}
