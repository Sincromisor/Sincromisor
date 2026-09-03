package rtc

import (
	"context"
	"strings"

	"github.com/pion/webrtc/v4"
)

// installCallbacks はPionのtransport/media eventをsession lifecycleのevent sourceへ接続する。
//
// callbackはresource cleanupを直接組み立てず、ICE異常はrecovery flow、media異常はCloseへ渡す。
// track/channelはconnected前でもlatchへ記録し、最後のreadinessとtimeout/Closeは
// sessionLifecycle.muの取得順で直列化する。
func (s *Session) installCallbacks() {
	s.pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		s.SafeCallback("connection_state", func() {
			if state == webrtc.PeerConnectionStateConnected {
				s.transportReady()
			}
		})()
	})
	s.pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		s.SafeCallback("ice_state", func() {
			s.logger.Info("ice state changed", "session_id", s.id, "stage", state.String())
			s.handleICEConnectionState(state)
		})()
	})
	s.pc.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		s.SafeCallback("track", func() {
			if track.Kind() != webrtc.RTPCodecTypeAudio ||
				!strings.EqualFold(track.Codec().MimeType, webrtc.MimeTypeOpus) {
				s.logger.Error("unexpected remote track", "session_id", s.id, "stage", "track", "reason", "media_read_error")
				_ = s.Close("unexpected_track")
				return
			}
			if s.acceptAudioTrack(track) {
				s.startInbound(rtpReader{track})
			}
		})()
	})
	s.pc.OnDataChannel(func(channel *webrtc.DataChannel) {
		s.SafeCallback("data_channel", func() { s.handleDataChannel(channel) })()
	})
}

// transportReady は Pion connected callback を answer_ready 後の transport_ready へ変換する。
//
// connected の重複は no-op とし、pre-connect timer を media readiness の10秒 timerへ交換する。
// connected 前に3 latchが成立済みなら同じ lock acquisition 内で media_ready も確定する。
func (s *Session) transportReady() {
	startPipeline := false
	startOutbound := false
	s.lifecycle.mu.Lock()
	switch s.lifecycle.state {
	case stateAnswerReady:
		if err := s.lifecycle.transitionLocked(stateTransportReady, "peer_connected"); err != nil {
			s.logTransitionError(err)
			s.lifecycle.mu.Unlock()
			return
		}
		if err := s.lifecycle.deadlines.replace(mediaReadinessTimeout, s.SafeCallback("deadline_media_readiness", func() {
			s.metrics().Deadline("media_readiness")
			s.closeIfState(stateTransportReady, "media_readiness_timeout")
		})); err != nil {
			s.logTransitionError(err)
			s.lifecycle.mu.Unlock()
			_ = s.Close("deadline_error")
			return
		}
		startOutbound = s.pc != nil && s.pc.ConnectionState() == webrtc.PeerConnectionStateConnected
		if startOutbound {
			// connected後にだけRTCP Readを開始する。transport未始動のgather timeoutでは
			// PionがReadを解除しない経路があるため、output clock、単一generation consumer、
			// text/synth consumer、RTCP drainを同じeventで予約する。
			s.wg.Add(5)
		}
		startPipeline = s.promoteMediaReadyLocked("peer_connected")
	case stateTransportReady, stateMediaReady, stateRunning, stateClosing, stateClosed:
		// Pionは同じconnected状態を再通知し得るが、timerやpipelineを再始動させない。
	default:
		err := s.lifecycle.transitionLocked(stateTransportReady, "peer_connected")
		s.logTransitionError(err)
		s.lifecycle.mu.Unlock()
		_ = s.Close("transition_error")
		return
	}
	s.lifecycle.mu.Unlock()
	if startOutbound {
		s.startRTCPDrain(s.outboundSender)
		s.startOutbound()
	}
	if startPipeline {
		s.launchPipeline()
	}
}

// acceptAudioTrack は最初のOpus trackだけをlatchへ保存し、decoder開始権を返す。
//
// 同じobjectの重複callbackはno-op、別objectの2本目はduplicate_media closeとする。latchは
// connected前にも保持し、最後のreadiness条件になった場合だけpipeline goroutineを予約する。
func (s *Session) acceptAudioTrack(track *webrtc.TrackRemote) bool {
	startPipeline := false
	s.lifecycle.mu.Lock()
	if s.lifecycle.terminalLocked() {
		s.lifecycle.mu.Unlock()
		return false
	}
	if s.lifecycle.audio != nil {
		same := s.lifecycle.audio == track
		s.lifecycle.mu.Unlock()
		if !same {
			_ = s.Close("duplicate_media")
		}
		return false
	}
	s.lifecycle.audio = track
	s.wg.Add(1)
	startPipeline = s.promoteMediaReadyLocked("audio_track")
	s.lifecycle.mu.Unlock()
	if startPipeline {
		s.launchPipeline()
	}
	return true
}

// registerDataChannel は検証済みchannel objectをlabel別latchへ一度だけ登録する。
//
// 到着だけではopen条件を満たさない。同じobjectの再通知はno-op、別objectの同labelは
// duplicate_media closeとし、新しいOnOpen callbackや下流resourceを開始させない。
func (s *Session) registerDataChannel(channel *webrtc.DataChannel) bool {
	startPipeline := false
	s.lifecycle.mu.Lock()
	if s.lifecycle.terminalLocked() {
		s.lifecycle.mu.Unlock()
		return false
	}
	var current **webrtc.DataChannel
	switch channel.Label() {
	case textChannelLabel:
		current = &s.lifecycle.textChannel
	case telopChannelLabel:
		current = &s.lifecycle.telopChannel
	default:
		s.lifecycle.mu.Unlock()
		return false
	}
	if *current != nil {
		same := *current == channel
		s.lifecycle.mu.Unlock()
		if !same {
			_ = s.Close("duplicate_media")
		}
		return false
	}
	*current = channel
	startPipeline = s.promoteMediaReadyLocked("data_channel_registered")
	s.lifecycle.mu.Unlock()
	if startPipeline {
		s.launchPipeline()
	}
	return true
}

// dataChannelOpened は登録済みobjectの最初のOnOpenだけをreadinessへ反映し、送信権を返す。
//
// 未登録、置換済み、同じopen stateの重複、closing後のcallbackはno-opとし、遅延callbackが
// pipelineを再開しないようobject identityとstateを同じlifecycle mutexで確認する。
func (s *Session) dataChannelOpened(channel *webrtc.DataChannel) bool {
	startPipeline := false
	s.lifecycle.mu.Lock()
	if s.lifecycle.terminalLocked() {
		s.lifecycle.mu.Unlock()
		return false
	}
	switch channel.Label() {
	case textChannelLabel:
		if s.lifecycle.textChannel != channel || s.lifecycle.textOpen {
			s.lifecycle.mu.Unlock()
			return false
		}
		s.lifecycle.textOpen = true
	case telopChannelLabel:
		if s.lifecycle.telopChannel != channel || s.lifecycle.telopOpen {
			s.lifecycle.mu.Unlock()
			return false
		}
		s.lifecycle.telopOpen = true
	default:
		s.lifecycle.mu.Unlock()
		return false
	}
	startPipeline = s.promoteMediaReadyLocked("data_channel_open")
	s.lifecycle.mu.Unlock()
	if startPipeline {
		s.launchPipeline()
	}
	return true
}

// promoteMediaReadyLocked はtransportと3 media latchのANDをpipeline開始予約へ変換する。
//
// callerはlifecycle mutexを保持する。state遷移、timer停止、WaitGroup予約を同じcritical sectionで
// 完了させるため、Closeは予約済みgoroutineを必ずjoinでき、重複callbackは2回目を開始できない。
func (s *Session) promoteMediaReadyLocked(event string) bool {
	if s.lifecycle.state != stateTransportReady || !s.lifecycle.allMediaReadyLocked() {
		return false
	}
	if err := s.lifecycle.transitionLocked(stateMediaReady, event); err != nil {
		s.logTransitionError(err)
		return false
	}
	s.lifecycle.deadlines.stop()
	s.wg.Add(1)
	return true
}

// launchPipeline は readiness lock が予約した1つの goroutine から4 clientの遅延接続を開始する。
//
// Close は session context と Coordinator.Close の両方で接続中処理を中断する。Start failure が
// closing より先なら同じ close-onceへ通知し、成功時だけ running を公開する。
func (s *Session) launchPipeline() {
	s.goReserved("pipeline_start", func(context.Context) {
		err := s.pipeline.Start(s.ctx, s.id, s.talkMode)
		if err != nil {
			s.lifecycle.mu.Lock()
			closing := s.lifecycle.terminalLocked()
			s.lifecycle.mu.Unlock()
			if !closing {
				s.logger.Error("pipeline start failed", "session_id", s.id, "reason", "pipeline_start_error")
				_ = s.Close("pipeline_start_error")
			}
			return
		}
		s.lifecycle.mu.Lock()
		if s.lifecycle.state == stateMediaReady {
			if transitionErr := s.lifecycle.transitionLocked(stateRunning, "pipeline_started"); transitionErr != nil {
				s.logTransitionError(transitionErr)
			}
		}
		s.lifecycle.mu.Unlock()
	})
}
