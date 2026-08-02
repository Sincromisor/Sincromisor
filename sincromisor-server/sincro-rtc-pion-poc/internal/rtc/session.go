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
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
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
	id       string
	talkMode string
	pc       *webrtc.PeerConnection
	pipeline *pipeline.Coordinator
	// synthDecoderはprocess-wide immutable dependencyへの非所有参照である。Session cleanupは
	// processを保持しないDecoderをcloseせず、別Sessionの同一参照を継続利用可能に保つ。
	synthDecoder synthSpeechDecoder
	input        *audiomedia.InputProcessor
	logger       *slog.Logger
	onClosed     func(string)
	lifecycle    *sessionLifecycle
	recorder     observability.Recorder

	ctx                context.Context
	cancel             context.CancelFunc
	wg                 sync.WaitGroup
	encoder            *audiomedia.FrameEncoder
	output             *audiomedia.OutputProcessor
	dispatcher         *DataChannelDispatcher
	outboundMu         sync.Mutex
	outboundGeneration uint64
	outboundTrack      *webrtc.TrackLocalStaticSample
	outboundSender     *webrtc.RTPSender
	done               chan struct{}
	closeStarted       time.Time
	closeMetricOnce    sync.Once
	closers            sessionResourceClosers
	revision           *revisionState
	// productionではnegotiateDescriptionへ固定する。test差し替えもremote適用済みboolを正しく返し、
	// partial apply後だけcloseするtransaction契約を維持しなければならない。
	negotiateUpdate func(context.Context, string) (webrtc.SessionDescription, bool, error)
	// productionではaddCandidateへ固定し、revision/dedupe/limit通過後だけ呼ぶPion適用境界である。
	candidateApplier func(webrtc.ICECandidateInit) error
}

// synthSpeechDecoderはprocess-wide decoderとdecode完了競合testを共有する非所有境界である。
type synthSpeechDecoder interface {
	Decode(context.Context, protocol.SynthesizerResult) (synthdecode.DecodedSpeech, error)
}

// sessionResourceClosers はSession cleanupが並行開始して完了を待つ所有resource境界である。
//
// productionではPeerConnection、codec、OutputProcessor、DataChannelDispatcher、Coordinatorへ固定し、
// testではblocking closeを注入してCloseの非blocking返却、close-once、全join後公開を観測する。
type sessionResourceClosers struct {
	peer       func() error
	codec      func() error
	output     func() error
	dispatcher func() error
	pipeline   func() error
}

// newSession は検証済みdependencyからPeerConnection、InputProcessor、codec、lifecycle ownerを組み立てる。
//
// talk modeとdependencyをresource作成前に拒否する。成功後の所有resourceはSession.Closeだけが破棄し、
// setup途中の失敗は作成済みresourceを同期的に巻き戻してregistryへ公開しない。SynthDecoderは
// process-wide非所有参照なのでcloserへ加えず、Session終了後も他Sessionが同じpointerを利用できる。
func newSession(
	id string,
	talkMode string,
	configuration webrtc.Configuration,
	gatherTimeout time.Duration,
	coordinator *pipeline.Coordinator,
	synthDecoder *synthdecode.Decoder,
	inputObserver audiomedia.InputObserver,
	clock Clock,
	logger *slog.Logger,
	onClosed func(string),
	recorders ...observability.Recorder,
) (*Session, error) {
	if id == "" || (talkMode != "chat" && talkMode != "sincro") {
		return nil, errors.New("rtc session identity or talk mode is invalid")
	}
	if coordinator == nil || synthDecoder == nil || inputObserver == nil || clock == nil || logger == nil || onClosed == nil {
		return nil, errors.New("rtc session dependencies must not be nil")
	}
	recorder := observability.Discard()
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
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
	encoder, err := audiomedia.NewFrameEncoder()
	if err != nil {
		_ = pc.Close()
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	session := &Session{
		id: id, talkMode: talkMode, pc: pc, pipeline: coordinator, synthDecoder: synthDecoder, input: input, logger: logger,
		onClosed: onClosed, lifecycle: lifecycle, ctx: ctx, cancel: cancel,
		encoder: encoder, done: make(chan struct{}), recorder: recorder,
	}
	if err := coordinator.ConfigureRuntime(recorder, func(stage string) {
		logger.Error("pipeline worker panic", "session_id", id, "stage", stage, "reason", "panic")
		_ = session.Close("panic")
	}); err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		cancel()
		return nil, err
	}
	dispatcher, err := NewDataChannelDispatcher(ctx, logger, func(error) {
		logger.Error("data channel dispatcher stopped", "session_id", id, "reason", "data_channel_error")
		_ = session.Close("data_channel_error")
	}, DataChannelDispatcherOptions{
		Recorder: recorder,
		RecoverPanic: func(stage string) {
			logger.Error("data channel callback panic", "session_id", id, "stage", stage, "reason", "panic")
			_ = session.Close("panic")
		},
	})
	if err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		cancel()
		return nil, err
	}
	session.dispatcher = dispatcher
	session.negotiateUpdate = session.negotiateDescription
	session.candidateApplier = session.addCandidate
	if err := session.installOutboundTrack(); err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		_ = dispatcher.Close()
		cancel()
		return nil, err
	}
	output, err := audiomedia.NewOutputProcessor(
		encoder,
		pionSampleWriter{track: session.outboundTrack},
		dispatcher.EnqueueTelop,
		logger,
		recorder,
	)
	if err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		_ = dispatcher.Close()
		cancel()
		return nil, err
	}
	session.output = output
	session.closers = sessionResourceClosers{
		peer:       pc.Close,
		codec:      encoder.Close,
		output:     output.Close,
		dispatcher: dispatcher.Close,
		pipeline:   coordinator.Close,
	}
	session.installCallbacks()
	logger.Info("rtc session created", "session_id", id)
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
// timer停止とcontext cancelは返却前に完了する。PeerConnection、codec、output、dispatcher、pipelineを
// 閉じてsession goroutineをjoinした後だけregistry removeとdone closeを行い、deadlineで待機を
// 諦めたManagerからもcleanupは独立して継続する。
func (s *Session) Close(reason string) error {
	s.lifecycle.mu.Lock()
	started := s.beginCloseLocked(reason)
	s.lifecycle.mu.Unlock()
	if started {
		s.startCleanup(reason)
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
	s.closeStarted = time.Now()
	s.cancel()
	return true
}

// cleanup はclosing確定後のresource close、全goroutine join、registry removeを順に完了する。
//
// Coordinator/dispatcher/output Closeはqueueとworkerを回収し、PeerConnection.CloseはRTP/RTCP blocking readを解除する。
// すべてをjoinするまでclosedとdoneを公開しないため、Manager deadlineは未完了を識別できる。
func (s *Session) cleanup(reason string) {
	closers := []func() error{
		s.closers.peer,
		s.closers.codec,
		s.closers.output,
		s.closers.dispatcher,
		s.closers.pipeline,
	}
	closeResults := make(chan error, len(closers))
	closeCount := 0
	for _, closeResource := range closers {
		if closeResource == nil {
			continue
		}
		closeCount++
		go func(closeResource func() error) {
			defer func() {
				if recover() != nil {
					closeResults <- errors.New("resource closer panic")
				}
			}()
			closeResults <- closeResource()
		}(closeResource)
	}
	for range closeCount {
		<-closeResults
	}
	s.wg.Wait()
	s.lifecycle.mu.Lock()
	if err := s.lifecycle.transitionLocked(stateClosed, "cleanup_complete"); err != nil {
		s.logTransitionError(err)
	}
	s.lifecycle.mu.Unlock()
	s.onClosed(s.id)
	close(s.done)
	outcome := "closed"
	if reason != "normal" && reason != "process_shutdown" {
		outcome = "failed"
	}
	s.metrics().SessionClosed(outcome, normalizeCloseReason(reason))
	s.recordCloseDuration("success")
	s.logger.Info("rtc session closed",
		"session_id", s.id,
		"reason", normalizeCloseReason(reason),
		"count", closeCount,
	)
}

func (s *Session) recordCloseDuration(outcome string) {
	s.closeMetricOnce.Do(func() {
		started := s.closeStarted
		if started.IsZero() {
			started = time.Now()
		}
		s.metrics().CloseDuration(outcome, time.Since(started))
	})
}

func (s *Session) metrics() observability.Recorder {
	if s.recorder == nil {
		return observability.Discard()
	}
	return s.recorder
}

func normalizeCloseReason(reason string) string {
	switch reason {
	case "normal", "process_shutdown", "offer_failed", "pre_connect_timeout", "media_readiness_timeout",
		"duplicate_media", "pipeline_start_error", "codec_error", "media_read_error", "media_write_error",
		"invalid_data_channel", "data_channel_error", "output_backpressure", "ice_failed",
		"ice_disconnected_timeout", "restart_timeout", "panic":
		return reason
	case "media_error", "unexpected_track":
		return "media_read_error"
	case "outbound_error":
		return "media_write_error"
	case "ice_restart_timeout":
		return "restart_timeout"
	default:
		return "unknown"
	}
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
		s.startCleanup(reason)
	}
}

// logTransitionError はtyped transition errorを運用判断するSession境界で一度だけ構造化記録する。
func (s *Session) logTransitionError(err error) {
	var transitionErr *TransitionError
	if errors.As(err, &transitionErr) {
		s.logger.Error("rejected rtc session state transition",
			"session_id", s.id,
			"stage", "lifecycle_transition",
			"reason", "invalid_transition",
		)
	}
}
