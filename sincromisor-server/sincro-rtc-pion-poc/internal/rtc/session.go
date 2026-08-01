// Package rtc は Pion PeerConnection、media readiness、pipeline、session registry の lifecycle を所有する。
package rtc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

// SessionDependencies は session 作成前に検証する遅延 pipeline、入力観測、deadline の依存境界である。
//
// PipelineFactory は media readiness 成立後の Coordinator.Start まで network I/O を開始してはならない。
// InputObserver は process 内の全 Session が共有し、payload を保持せず drop decision を集計する。
// Clock は Answer 後と transport 後の有限 deadline を生成し、nil dependency は無効である。
type SessionDependencies struct {
	PipelineFactory pipeline.ClientSetFactory
	InputObserver   audiomedia.InputObserver
	Clock           Clock
}

// Session は1 PeerConnection、revision transaction、pipeline、codec、timer、session goroutineを所有する。
//
// Close は closing を同期的に一度だけ確定して直ちに返す。resource close と join は cleanup goroutine が
// 継続し、全 resource 終了後だけ closed、registry remove、Done channel closeへ進む。
type Session struct {
	id        string
	talkMode  string
	pc        *webrtc.PeerConnection
	pipeline  *pipeline.Coordinator
	input     *audiomedia.InputProcessor
	logger    *slog.Logger
	onClosed  func(string)
	lifecycle *sessionLifecycle

	ctx            context.Context
	cancel         context.CancelFunc
	wg             sync.WaitGroup
	encoder        *audiomedia.ToneEncoder
	outboundTrack  *webrtc.TrackLocalStaticSample
	outboundSender *webrtc.RTPSender
	done           chan struct{}
	closers        sessionResourceClosers
	revision       *revisionState
	// productionではnegotiateDescriptionへ固定する。test差し替えもremote適用済みboolを正しく返し、
	// partial apply後だけcloseするtransaction契約を維持しなければならない。
	negotiateUpdate func(context.Context, string) (webrtc.SessionDescription, bool, error)
	// productionではaddCandidateへ固定し、revision/dedupe/limit通過後だけ呼ぶPion適用境界である。
	candidateApplier func(webrtc.ICECandidateInit) error
}

// sessionResourceClosers はSession cleanupが並行開始して完了を待つ3つの所有resource境界である。
//
// productionではPeerConnection、codec、Coordinatorへ固定し、testではblocking closeを注入して
// Closeの非blocking返却、close-once、全join後公開を実時間sleepなしで観測する。
type sessionResourceClosers struct {
	peer     func() error
	codec    func() error
	pipeline func() error
}

// newSession は検証済みdependencyからPeerConnection、InputProcessor、codec、lifecycle ownerを組み立てる。
//
// talk modeとdependencyをresource作成前に拒否する。成功後の全resourceはSession.Closeだけが破棄し、
// setup途中の失敗は作成済みresourceを同期的に巻き戻してregistryへ公開しない。
func newSession(
	id string,
	talkMode string,
	configuration webrtc.Configuration,
	gatherTimeout time.Duration,
	coordinator *pipeline.Coordinator,
	inputObserver audiomedia.InputObserver,
	clock Clock,
	logger *slog.Logger,
	onClosed func(string),
) (*Session, error) {
	if id == "" || (talkMode != "chat" && talkMode != "sincro") {
		return nil, errors.New("rtc session identity or talk mode is invalid")
	}
	if coordinator == nil || inputObserver == nil || clock == nil || logger == nil || onClosed == nil {
		return nil, errors.New("rtc session dependencies must not be nil")
	}
	input, err := audiomedia.NewInputProcessor(inputObserver)
	if err != nil {
		return nil, err
	}
	lifecycle, err := newSessionLifecycle(clock)
	if err != nil {
		return nil, err
	}
	pc, err := newPeerConnection(configuration, gatherTimeout)
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
		id: id, talkMode: talkMode, pc: pc, pipeline: coordinator, input: input, logger: logger,
		onClosed: onClosed, lifecycle: lifecycle, ctx: ctx, cancel: cancel,
		encoder: encoder, done: make(chan struct{}),
		closers: sessionResourceClosers{
			peer:     pc.Close,
			codec:    encoder.Close,
			pipeline: coordinator.Close,
		},
	}
	session.negotiateUpdate = session.negotiateDescription
	session.candidateApplier = session.addCandidate
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

// newPeerConnection はHTTP Answer生成deadlineをPion内部のSTUN transaction上限へ伝播する。
//
// request contextだけを先に返すと、Pionの既定STUN gatherが背後で継続し、Closeとregistry removeが
// 最大数秒遅れる。正数durationだけSettingEngineへ設定し、deadlineなしcallerはPion既定値を使う。
func newPeerConnection(
	configuration webrtc.Configuration,
	gatherTimeout time.Duration,
) (*webrtc.PeerConnection, error) {
	if gatherTimeout <= 0 {
		return webrtc.NewPeerConnection(configuration)
	}
	settings := webrtc.SettingEngine{}
	settings.SetSTUNGatherTimeout(gatherTimeout)
	api := webrtc.NewAPI(webrtc.WithSettingEngine(settings))
	return api.NewPeerConnection(configuration)
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
	s.lifecycle.recoveryDeadlines.stop()
	s.lifecycle.closeReason = reason
	s.cancel()
	return true
}

// cleanup はclosing確定後のresource close、全goroutine join、registry removeを順に完了する。
//
// Coordinator.Closeは接続開始中もcancel/joinし、PeerConnection.CloseはRTP/RTCP blocking readを解除する。
// すべてをjoinするまでclosedとdoneを公開しないため、Manager deadlineは未完了を識別できる。
func (s *Session) cleanup(reason string) {
	closeResults := make(chan error, 3)
	go func() { closeResults <- s.closers.peer() }()
	go func() { closeResults <- s.closers.codec() }()
	go func() { closeResults <- s.closers.pipeline() }()
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
	s.onClosed(s.id)
	close(s.done)
	s.logger.Info("rtc session closed",
		"session_id", s.id,
		"reason", reason,
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
