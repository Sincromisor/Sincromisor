package rtc

import "github.com/pion/webrtc/v4"

// handleICEConnectionState はPion ICE callbackをgrace/restart deadline/closeへ変換する。
//
// disconnectedは10秒の自然復旧猶予を開始し、connectedなら猶予だけをcancelする。failedまたは
// grace超過は15秒のrestart deadlineへ進み、connected通知だけではcancelせず成功updateを要求する。
// closedとdeadline発火は既存close-onceへ収束し、重複callbackは期限を延長しない。
func (s *Session) handleICEConnectionState(state webrtc.ICEConnectionState) {
	switch state {
	case webrtc.ICEConnectionStateClosed:
		_ = s.Close("ice_closed")
	case webrtc.ICEConnectionStateDisconnected:
		s.startDisconnectGrace()
	case webrtc.ICEConnectionStateFailed:
		s.requireRestart()
	case webrtc.ICEConnectionStateConnected, webrtc.ICEConnectionStateCompleted:
		s.recoverNaturally()
	default:
	}
}

// startDisconnectGrace はrunning transportの最初のdisconnectedだけに10秒猶予を設定する。
func (s *Session) startDisconnectGrace() {
	s.lifecycle.mu.Lock()
	defer s.lifecycle.mu.Unlock()
	if s.lifecycle.terminalLocked() || s.lifecycle.recovery != recoveryNone {
		return
	}
	switch s.lifecycle.state {
	case stateTransportReady, stateMediaReady, stateRunning:
	default:
		return
	}
	s.lifecycle.recovery = recoveryGrace
	if err := s.lifecycle.recoveryDeadlines.replace(disconnectGraceTimeout, s.disconnectGraceExpired); err != nil {
		go func() { _ = s.Close("deadline_error") }()
	}
}

// disconnectGraceExpired は猶予をrestart-requiredへ進め、追加15秒だけ同じSessionを保持する。
func (s *Session) disconnectGraceExpired() {
	s.lifecycle.mu.Lock()
	if s.lifecycle.terminalLocked() || s.lifecycle.recovery != recoveryGrace {
		s.lifecycle.mu.Unlock()
		return
	}
	s.lifecycle.recovery = recoveryNeedsRestart
	err := s.lifecycle.recoveryDeadlines.replace(restartDeadlineTimeout, s.restartDeadlineExpired)
	s.lifecycle.mu.Unlock()
	if err != nil {
		_ = s.Close("deadline_error")
	}
}

// requireRestart はfailed callbackをrestart-requiredへ進め、重複通知では期限を延長しない。
func (s *Session) requireRestart() {
	s.lifecycle.mu.Lock()
	if s.lifecycle.terminalLocked() || s.lifecycle.recovery == recoveryNeedsRestart {
		s.lifecycle.mu.Unlock()
		return
	}
	s.lifecycle.recovery = recoveryNeedsRestart
	err := s.lifecycle.recoveryDeadlines.replace(restartDeadlineTimeout, s.restartDeadlineExpired)
	s.lifecycle.mu.Unlock()
	if err != nil {
		_ = s.Close("deadline_error")
	}
}

// restartDeadlineExpired は期限時点のphase再確認とclose開始を同じlifecycle lockで確定する。
func (s *Session) restartDeadlineExpired() {
	s.lifecycle.mu.Lock()
	if s.lifecycle.terminalLocked() || s.lifecycle.recovery != recoveryNeedsRestart {
		s.lifecycle.mu.Unlock()
		return
	}
	started := s.beginCloseLocked("ice_restart_timeout")
	s.lifecycle.mu.Unlock()
	if started {
		go s.cleanup("ice_restart_timeout")
	}
}

// recoverNaturally はgrace中のconnectedだけを通常状態へ戻し、restart-requiredは維持する。
func (s *Session) recoverNaturally() {
	s.lifecycle.mu.Lock()
	defer s.lifecycle.mu.Unlock()
	if s.lifecycle.recovery != recoveryGrace {
		return
	}
	s.lifecycle.recovery = recoveryNone
	s.lifecycle.recoveryDeadlines.stop()
}
