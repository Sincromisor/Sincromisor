// Package rtc は Pion PeerConnection、media readiness、pipeline、session registry の lifecycle を所有する。
package rtc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

// SessionDependencies は session 作成前に検証する遅延 pipeline と deadline の依存境界である。
//
// PipelineFactory は media readiness 成立後の Coordinator.Start まで network I/O を開始してはならない。
// Clock は Answer 後と transport 後の有限 deadline を生成し、nil dependency は無効である。
type SessionDependencies struct {
	PipelineFactory pipeline.ClientSetFactory
	Clock           Clock
}

// Session は 1 PeerConnection、pipeline Coordinator、codec、timer、session goroutine を所有する。
//
// Close は closing を同期的に一度だけ確定して直ちに返す。resource close と join は cleanup goroutine が
// 継続し、全 resource 終了後だけ closed、registry remove、Done channel closeへ進む。
type Session struct {
	id        string
	talkMode  string
	pc        *webrtc.PeerConnection
	pipeline  *pipeline.Coordinator
	logger    *slog.Logger
	onClosed  func(string)
	lifecycle *sessionLifecycle

	ctx           context.Context
	cancel        context.CancelFunc
	wg            sync.WaitGroup
	encoder       *audiomedia.ToneEncoder
	outboundTrack *webrtc.TrackLocalStaticSample
	done          chan struct{}

	statsMu sync.Mutex
	stats   audiomedia.DecodeStats
}

// newSession は検証済みdependencyからPeerConnection、codec、lifecycle ownerを組み立てる。
//
// talk modeとdependencyをresource作成前に拒否する。成功後の全resourceはSession.Closeだけが破棄し、
// setup途中の失敗は作成済みresourceを同期的に巻き戻してregistryへ公開しない。
func newSession(
	id string,
	talkMode string,
	configuration webrtc.Configuration,
	coordinator *pipeline.Coordinator,
	clock Clock,
	logger *slog.Logger,
	onClosed func(string),
) (*Session, error) {
	if id == "" || (talkMode != "chat" && talkMode != "sincro") {
		return nil, errors.New("rtc session identity or talk mode is invalid")
	}
	if coordinator == nil || clock == nil || logger == nil || onClosed == nil {
		return nil, errors.New("rtc session dependencies must not be nil")
	}
	lifecycle, err := newSessionLifecycle(clock)
	if err != nil {
		return nil, err
	}
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
		id: id, talkMode: talkMode, pc: pc, pipeline: coordinator, logger: logger,
		onClosed: onClosed, lifecycle: lifecycle, ctx: ctx, cancel: cancel,
		encoder: encoder, done: make(chan struct{}),
	}
	if err := session.installOutboundTrack(); err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		cancel()
		return nil, err
	}
	session.installCallbacks()
	logger.Info("rtc session created", "session_id", id, "talk_mode", talkMode)
	return session, nil
}

// negotiate はremote Offerからcandidate収集済みlocal Answerを作り、answer_readyを公開する。
//
// caller contextはcandidate収集待機だけを制限する。成功後のtransport deadlineはsession clockへ移し、
// HTTP request終了後もPeerConnection lifecycleとして継続する。
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
	if err := s.answerReady(); err != nil {
		return webrtc.SessionDescription{}, err
	}
	return *local, nil
}

// answerReady は candidate 収集済み Answer を lifecycle へ公開し、15秒の transport deadline を開始する。
//
// timer callback は同じ Close 経路だけを通知する。Clock.Stop と同時発火しても lifecycle mutex を
// 先に得た event が state を確定し、closing 以後の callback は resource を変更しない。
func (s *Session) answerReady() error {
	s.lifecycle.mu.Lock()
	defer s.lifecycle.mu.Unlock()
	if err := s.lifecycle.transitionLocked(stateAnswerReady, "answer_generated"); err != nil {
		s.logTransitionError(err)
		return err
	}
	if err := s.lifecycle.deadlines.replace(preConnectTimeout, func() {
		s.closeIfState(stateAnswerReady, "pre_connect_timeout")
	}); err != nil {
		s.logTransitionError(err)
		return err
	}
	return nil
}

// addCandidate はactive sessionだけをPion candidate境界へ通し、closing後のlate candidateを拒否する。
func (s *Session) addCandidate(candidate webrtc.ICECandidateInit) error {
	if err := s.ctx.Err(); err != nil {
		return err
	}
	if err := s.pc.AddICECandidate(candidate); err != nil {
		return fmt.Errorf("add ice candidate: %w", err)
	}
	return nil
}

// Close は closing を一度だけ確定し、全 resource の非同期 cleanup を開始する。
//
// timer停止とcontext cancelは返却前に完了する。PeerConnection、codec、pipelineを閉じて session
// goroutineをjoinした後だけ registry remove と done closeを行い、deadlineで待機を諦めたManagerからも
// cleanupは独立して継続する。
func (s *Session) Close(reason string) error {
	s.lifecycle.mu.Lock()
	started := s.beginCloseLocked(reason)
	s.lifecycle.mu.Unlock()
	if started {
		go s.cleanup(reason)
	}
	return nil
}

// beginCloseLocked は全終了eventをclosing、timer停止、session cancelの1つのlinearization pointへ集約する。
//
// callerはlifecycle mutexを保持する。falseは別eventが既にclosing/closedを確定済みであり、
// cleanup goroutineを追加してはならないことを表す。
func (s *Session) beginCloseLocked(reason string) bool {
	if s.lifecycle.terminalLocked() {
		return false
	}
	if err := s.lifecycle.transitionLocked(stateClosing, "close:"+reason); err != nil {
		s.logTransitionError(err)
		return false
	}
	s.lifecycle.deadlines.stop()
	s.cancel()
	return true
}

// cleanup はclosing確定後のresource close、全goroutine join、registry removeを順に完了する。
//
// Coordinator.Closeは接続開始中もcancel/joinし、PeerConnection.CloseはRTP/RTCP blocking readを解除する。
// すべてをjoinするまでclosedとdoneを公開しないため、Manager deadlineは未完了を識別できる。
func (s *Session) cleanup(reason string) {
	closeResults := make(chan error, 3)
	go func() { closeResults <- s.pc.Close() }()
	go func() { closeResults <- s.encoder.Close() }()
	go func() { closeResults <- s.pipeline.Close() }()
	var closeErr error
	for range 3 {
		closeErr = errors.Join(closeErr, <-closeResults)
	}
	s.wg.Wait()
	s.lifecycle.mu.Lock()
	if err := s.lifecycle.transitionLocked(stateClosed, "cleanup_complete"); err != nil {
		s.logTransitionError(err)
	}
	s.lifecycle.mu.Unlock()
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
		"cleanup_error", closeErr,
	)
}

// closeIfState はtimer eventと現在stateの照合、closing遷移を同じmutex acquisitionで確定する。
//
// Stopと発火が競合しても、先にmutexを得たconnected/readiness/Closeだけが勝ち、期限を離れた
// check-then-closeにして新stateを誤って閉じない。
func (s *Session) closeIfState(expected sessionState, reason string) {
	s.lifecycle.mu.Lock()
	if s.lifecycle.state != expected {
		s.lifecycle.mu.Unlock()
		return
	}
	started := s.beginCloseLocked(reason)
	s.lifecycle.mu.Unlock()
	if started {
		go s.cleanup(reason)
	}
}

// logTransitionError はtyped transition errorを運用判断するSession境界で一度だけ構造化記録する。
func (s *Session) logTransitionError(err error) {
	var transitionErr *TransitionError
	if errors.As(err, &transitionErr) {
		s.logger.Error("rejected rtc session state transition",
			"session_id", s.id,
			"from", transitionErr.From,
			"to", transitionErr.To,
			"event", transitionErr.Event,
		)
	}
}
