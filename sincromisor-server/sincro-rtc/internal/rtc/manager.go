package rtc

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/oklog/ulid/v2"
	"github.com/pion/webrtc/v4"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

// ManagerConfig は全sessionで共有するdependencyとactive session上限の起動時境界である。
//
// NewManager はnil dependencyと非正数MaxSessionsを拒否する。sessionごとに同じfactoryから専用Coordinatorを1つ作り、
// observerはprocess集計を行うため全sessionから同期的に呼ばれる。Clockは各session固有timerだけを
// 生成する。SynthDecoderはimmutableな非所有参照として全sessionへ同じpointerを渡すため、
// 共有dependencyはすべて並行利用可能でなければならない。
type ManagerConfig struct {
	PipelineFactory pipeline.ClientSetFactory
	InputObserver   inputmedia.Observer
	Clock           Clock
	Logger          *slog.Logger
	MaxSessions     int
	// APIは全Sessionで共有するprocess-wide Pion APIである。nilの場合だけfocused unit test用の
	// local API生成経路を使う。
	API *webrtc.API
	// SynthDecoderは全Sessionが同一pointerを非所有参照するimmutable dependencyである。
	SynthDecoder *synthdecode.Decoder
	// Recorder receives finite-cardinality lifecycle events. Nil selects a no-op
	// recorder so lower-level tests do not need a Prometheus registry.
	Recorder observability.Recorder
}

// sessionBuildRequest はadmission後にSession resource境界へ渡す検証済みの作成入力をまとめる。
// Coordinatorはcallerが生成して渡し、builderはPeerConnectionとcodecを内部で生成する。
// synthDecoderはManagerのprocess-wide参照をコピーせずそのままSessionへ渡す。
type sessionBuildRequest struct {
	id            string
	talkMode      string
	gatherTimeout time.Duration
	coordinator   *pipeline.Coordinator
	synthDecoder  *synthdecode.Decoder
	onClosed      func(string)
	recorder      observability.Recorder
}

// sessionBuilder はadmission reservation後にだけ到達するPeerConnection/codec作成境界である。
//
// 成功return時だけCoordinator、PeerConnection、codecの全所有権をSessionへ移す。error時はbuilderが
// 内部生成済みPeerConnection/codecを片付け、callerのManager.CreateがCoordinatorをcloseする。
type sessionBuilder func(sessionBuildRequest) (*Session, error)

// Manager は active PeerConnection の registry と process-wide shutdown を所有する。
//
// registry lock は map の参照だけを保護し、PeerConnection I/O や Close 待機中は保持しない。
// SynthDecoderだけはimmutableなprocess-wide非所有参照として共有し、Manager/Session cleanup対象にしない。
// その他のdependenciesはsessionごとのCoordinator生成とdeadlineへ再利用し、resource自体は共有しない。
// unknown と closed session は candidate endpoint で区別できるprocess-lifetime tombstoneとして保持する。
// initial Offer の有限TTL tombstoneはsignaling registryが別に所有し、このmapはcandidate契約専用である。
type Manager struct {
	mu            sync.RWMutex
	sessions      map[string]*Session
	closed        map[string]struct{}
	configuration webrtc.Configuration
	config        ManagerConfig
	reservations  int
	maxSessions   int
	buildSession  sessionBuilder
}

// NewManager は optional STUN URL とprocess共有Pion APIをconfigurationへ反映し、必須dependencyを検証する。
//
// STUN URLの構文検証は起動時config loaderの責務であり、ここでは再検証しない。network I/O、
// PeerConnection、CoordinatorはCreateまで開始しない。Manager はprocess shutdown時に5秒上限の
// contextを渡してCloseAllを呼ぶ必要がある。APIがnilの場合だけlocal test用のPeerConnection生成を使う。
func NewManager(stunURL string, config ManagerConfig) (*Manager, error) {
	if config.PipelineFactory == nil || config.InputObserver == nil ||
		config.Clock == nil || config.Logger == nil || config.SynthDecoder == nil {
		return nil, errors.New("rtc manager dependencies must not be nil")
	}
	if config.MaxSessions <= 0 {
		return nil, errors.New("rtc manager max sessions must be positive")
	}
	if config.Recorder == nil {
		config.Recorder = observability.Discard()
	}
	configuration := webrtc.Configuration{}
	if stunURL != "" {
		configuration.ICEServers = []webrtc.ICEServer{{URLs: []string{stunURL}}}
	}
	manager := &Manager{
		sessions:      make(map[string]*Session),
		closed:        make(map[string]struct{}),
		configuration: configuration,
		config:        config,
		maxSessions:   config.MaxSessions,
	}
	manager.buildSession = func(request sessionBuildRequest) (*Session, error) {
		return newSession(
			request.id,
			request.talkMode,
			manager.configuration,
			request.gatherTimeout,
			request.coordinator,
			request.synthDecoder,
			manager.config.InputObserver,
			manager.config.Clock,
			manager.config.Logger,
			request.onClosed,
			config.API,
			request.recorder,
		)
	}
	return manager, nil
}

// Create は initial Offer から session を作り、half-trickle Answer を返す。
//
// type、SDP、talk_mode、initial request UUIDをresource作成前に検証する。session専用Coordinatorを
// 作った後、request deadlineをPionのSTUN gather上限へ伝播してcandidate収集済みAnswerを作る。
// 成功Answerをrevision 1のretry基点として保存し、失敗時は同じ非同期close経路へ通知する。
func (m *Manager) Create(ctx context.Context, offer Offer) (result Answer, returnErr error) {
	if offer.Type != "offer" {
		return Answer{}, errors.New("offer type must be offer")
	}
	if strings.TrimSpace(offer.SDP) == "" {
		return Answer{}, errors.New("offer sdp is required")
	}
	if offer.TalkMode != "chat" && offer.TalkMode != "sincro" {
		return Answer{}, errors.New("talk mode must be chat or sincro")
	}
	requestID, err := uuid.Parse(offer.OfferRequestID)
	if err != nil {
		return Answer{}, errors.New("offer request id must be a UUID")
	}
	// Coordinator、PeerConnection、codec作成前にadmissionを予約する。Session公開またはsetup失敗まで
	// registry lock配下のactive+reservation合計へ含め、並行作成でもMaxSessionsを超えない。
	if err := m.reserve(); err != nil {
		return Answer{}, err
	}
	reserved := true
	var coordinator *pipeline.Coordinator
	var session *Session
	defer func() {
		if recover() != nil {
			switch {
			case session != nil:
				_ = session.Close("panic")
			case coordinator != nil:
				_ = coordinator.Close()
			}
			result = Answer{}
			returnErr = ErrSessionPanic
		}
		if reserved {
			m.releaseReservation()
		}
	}()
	coordinator, err = pipeline.NewCoordinator(m.config.PipelineFactory, m.config.Logger)
	if err != nil {
		return Answer{}, err
	}
	sessionID := ulid.Make().String()
	gatherTimeout := time.Duration(0)
	if deadline, ok := ctx.Deadline(); ok {
		gatherTimeout = time.Until(deadline)
		if gatherTimeout <= 0 {
			_ = coordinator.Close()
			return Answer{}, ctx.Err()
		}
	}
	session, err = m.buildSession(sessionBuildRequest{
		id:            sessionID,
		talkMode:      offer.TalkMode,
		gatherTimeout: gatherTimeout,
		coordinator:   coordinator,
		synthDecoder:  m.config.SynthDecoder,
		onClosed: func(closedID string) {
			m.remove(closedID)
			if offer.OnClosed != nil {
				offer.OnClosed(closedID)
			}
		},
		recorder: m.config.Recorder,
	})
	if err != nil {
		_ = coordinator.Close()
		return Answer{}, err
	}
	m.mu.Lock()
	m.reservations--
	reserved = false
	m.sessions[sessionID] = session
	m.mu.Unlock()
	m.config.Recorder.SessionCreated()

	answer, err := session.negotiate(ctx, offer.SDP)
	if err != nil {
		_ = session.Close("offer_failed")
		return Answer{}, err
	}
	result = Answer{SDP: answer.SDP, Type: answer.Type.String(), SessionID: sessionID, Revision: 1}
	session.revision = newRevisionState(requestID, offer.SDP, result)
	return result, nil
}

// ErrSessionPanic reports a recovered panic during initial Session construction
// or negotiation. Manager has already released admission and closed any
// partially-owned resources when this error reaches signaling.
var ErrSessionPanic = errors.New("rtc session creation panic")

// Limit returns the immutable process admission ceiling used by initial Offer
// reservation and the statuses endpoint. It performs no resource lookup.
func (m *Manager) Limit() int { return m.maxSessions }

// Recorder returns the concurrency-safe process recorder shared by every
// Session and operational endpoint; callers must not replace it after startup.
func (m *Manager) Recorder() observability.Recorder { return m.config.Recorder }

// ErrSessionCapacity はactive Sessionと作成予約の合計がMaxSessionsへ到達したことを表す。
// 別Sessionのcleanup完了後は再試行できる。
var ErrSessionCapacity = errors.New("rtc session capacity reached")

// reserve はactive Sessionとresource作成前の他reservationを合算し、作成可否をatomicに確定する。
func (m *Manager) reserve() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.sessions)+m.reservations >= m.maxSessions {
		return ErrSessionCapacity
	}
	m.reservations++
	return nil
}

// releaseReservation はSession公開前のsetup failureをadmission合計から除き、次のCreateを許可する。
func (m *Manager) releaseReservation() {
	m.mu.Lock()
	m.reservations--
	m.mu.Unlock()
}

// Count は現在 registry にある active session 数を返す。
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

// CloseSession routes a known HTTP mutation panic to that session's close-once
// lifecycle. Unknown or already-removed sessions are intentionally ignored.
func (m *Manager) CloseSession(sessionID, reason string) {
	m.mu.RLock()
	session := m.sessions[sessionID]
	m.mu.RUnlock()
	if session != nil {
		_ = session.Close(reason)
	}
}

// CloseAll は process shutdown 時のactive sessionをsnapshotし、全cleanup完了まで待つ。
//
// reason省略時はprocess_shutdownを使う。ctx deadlineを超えた場合はctx.Errを返すが、done closeや
// registry removeを偽装せず、各Sessionのcleanup goroutineは完了まで継続する。registry lockは
// Close通知にも待機にも保持しないため、並行callbackを妨げない。CloseAll自身は期限を延長せず、
// process coordinatorがOffer ownerと共有するcontextの範囲で終了を待つ。
func (m *Manager) CloseAll(ctx context.Context, reasons ...string) error {
	if ctx == nil {
		return errors.New("rtc manager close context must not be nil")
	}
	reason := "process_shutdown"
	if len(reasons) > 0 && reasons[0] != "" {
		reason = reasons[0]
	}
	m.mu.RLock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessions = append(sessions, session)
	}
	m.mu.RUnlock()
	for _, session := range sessions {
		_ = session.Close(reason)
	}
	for _, session := range sessions {
		select {
		case <-session.done:
		case <-ctx.Done():
			m.config.Recorder.Deadline("close")
			for _, pending := range sessions {
				select {
				case <-pending.done:
				default:
					pending.recordCloseDuration("timeout")
				}
			}
			return ctx.Err()
		}
	}
	return nil
}

// remove はSession cleanup完了通知をactive registryからprocess-lifetime tombstoneへ変換する。
//
// Sessionだけが呼び、unknown/closed candidateの区別を維持する。resource join前の早期removeは行わない。
func (m *Manager) remove(sessionID string) {
	m.mu.Lock()
	delete(m.sessions, sessionID)
	m.closed[sessionID] = struct{}{}
	activeSessions := len(m.sessions)
	m.mu.Unlock()
	m.config.Logger.Info("session registry updated", "session_id", sessionID, "count", activeSessions)
}
