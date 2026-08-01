package rtc

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
)

// Offer は Frontend の initial Offer を Pion session 作成境界へ渡す。
type Offer struct {
	SDP      string
	Type     string
	TalkMode string
	// OnClosedはSessionの全resource join後にserver発行IDを通知し、cached Answerを有限tombstoneへ変換する。
	OnClosed func(string)
}

// Answer は candidate 収集済み SDP と server が払い出した ULID session ID を返す。
type Answer struct {
	SDP       string `json:"sdp"`
	Type      string `json:"type"`
	SessionID string `json:"session_id"`
	Revision  int    `json:"offer_revision"`
}

// Candidate は Frontend の Trickle ICE candidate または end-of-candidates を表す。
//
// nil は `candidate: null` であり、AddCandidate は空 candidate として Pion へ渡す。
type Candidate struct {
	Candidate        string  `json:"candidate"`
	SDPMid           *string `json:"sdpMid,omitempty"`
	SDPMLineIndex    *uint16 `json:"sdpMLineIndex,omitempty"`
	UsernameFragment *string `json:"usernameFragment,omitempty"`
}

// ManagerConfig は全sessionで共有するdependencyとactive session上限の起動時境界である。
//
// NewManager はnil dependencyと非正数MaxSessionsを拒否する。sessionごとに同じfactoryから専用Coordinatorを1つ作り、
// observerはprocess集計を行うため全sessionから同期的に呼ばれる。Clockは各session固有timerだけを
// 生成するため、共有dependencyはすべて並行利用可能でなければならない。
type ManagerConfig struct {
	PipelineFactory pipeline.ClientSetFactory
	InputObserver   audiomedia.InputObserver
	Clock           Clock
	Logger          *slog.Logger
	MaxSessions     int
}

// sessionBuildRequest はadmission後にSession resource境界へ渡す検証済みの作成入力をまとめる。
// builderの呼び出しがPeerConnection、codec、Coordinator所有権をSessionへ移す境界となる。
type sessionBuildRequest struct {
	id            string
	talkMode      string
	gatherTimeout time.Duration
	coordinator   *pipeline.Coordinator
	onClosed      func(string)
}

// sessionBuilder はadmission reservation後にだけ到達するPeerConnection/codec作成境界である。
type sessionBuilder func(sessionBuildRequest) (*Session, error)

// Manager は active PeerConnection の registry と process-wide shutdown を所有する。
//
// registry lock は map の参照だけを保護し、PeerConnection I/O や Close 待機中は保持しない。
// dependenciesはsessionごとのCoordinator生成とdeadlineへ再利用し、resource自体はManagerへ共有しない。
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

// NewManager は optional STUN URL をPion configurationへ反映し、必須dependencyを検証する。
//
// STUN URLの構文検証は起動時config loaderの責務であり、ここでは再検証しない。network I/O、
// PeerConnection、CoordinatorはCreateまで開始しない。Manager はprocess shutdown時に5秒上限の
// contextを渡してCloseAllを呼ぶ必要がある。TURN、固定UDP mux、NAT rewriteは対象外である。
func NewManager(stunURL string, config ManagerConfig) (*Manager, error) {
	if config.PipelineFactory == nil || config.InputObserver == nil ||
		config.Clock == nil || config.Logger == nil {
		return nil, errors.New("rtc manager dependencies must not be nil")
	}
	if config.MaxSessions <= 0 {
		return nil, errors.New("rtc manager max sessions must be positive")
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
			manager.config.InputObserver,
			manager.config.Clock,
			manager.config.Logger,
			request.onClosed,
		)
	}
	return manager, nil
}

// Create は initial Offer から session を作り、half-trickle Answer を返す。
//
// type、SDP、talk_modeをresource作成前に検証する。session専用Coordinatorを作った後、request deadlineを
// PionのSTUN gather上限へ伝播してremote description、outbound track、local Answer、candidate収集を行う。
// 失敗時は同じ非同期close経路へ通知し、registryからの除去はresource join完了後にだけ行う。
func (m *Manager) Create(ctx context.Context, offer Offer) (Answer, error) {
	if offer.Type != "offer" {
		return Answer{}, errors.New("offer type must be offer")
	}
	if strings.TrimSpace(offer.SDP) == "" {
		return Answer{}, errors.New("offer sdp is required")
	}
	if offer.TalkMode != "chat" && offer.TalkMode != "sincro" {
		return Answer{}, errors.New("talk mode must be chat or sincro")
	}
	// Coordinator、PeerConnection、codec作成前にadmissionを予約する。Session公開またはsetup失敗まで
	// registry lock配下のactive+reservation合計へ含め、並行作成でもMaxSessionsを超えない。
	if err := m.reserve(); err != nil {
		return Answer{}, err
	}
	reserved := true
	defer func() {
		if reserved {
			m.releaseReservation()
		}
	}()
	coordinator, err := pipeline.NewCoordinator(m.config.PipelineFactory, m.config.Logger)
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
	session, err := m.buildSession(sessionBuildRequest{
		id:            sessionID,
		talkMode:      offer.TalkMode,
		gatherTimeout: gatherTimeout,
		coordinator:   coordinator,
		onClosed: func(closedID string) {
			m.remove(closedID)
			if offer.OnClosed != nil {
				offer.OnClosed(closedID)
			}
		},
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

	answer, err := session.negotiate(ctx, offer.SDP)
	if err != nil {
		_ = session.Close("offer_failed")
		return Answer{}, err
	}
	return Answer{SDP: answer.SDP, Type: answer.Type.String(), SessionID: sessionID, Revision: 1}, nil
}

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

// AddCandidate は active session へ Trickle ICE candidate を適用する。
//
// active session なら applied=true を返す。不明または終了済み session は HTTP handler が
// 200 + status:false へ変換できる reason を返し、新規 session へ fallback しない。
func (m *Manager) AddCandidate(sessionID string, candidate *Candidate) (applied bool, reason string, err error) {
	m.mu.RLock()
	session := m.sessions[sessionID]
	_, wasClosed := m.closed[sessionID]
	m.mu.RUnlock()
	if session == nil {
		if wasClosed {
			return false, "session_closed", nil
		}
		return false, "unknown_session", nil
	}
	init := webrtc.ICECandidateInit{}
	if candidate != nil {
		if strings.TrimSpace(candidate.Candidate) == "" {
			return false, "", errors.New("candidate string is required")
		}
		init = webrtc.ICECandidateInit{
			Candidate:        candidate.Candidate,
			SDPMid:           candidate.SDPMid,
			SDPMLineIndex:    candidate.SDPMLineIndex,
			UsernameFragment: candidate.UsernameFragment,
		}
	}
	if err := session.addCandidate(init); err != nil {
		return false, "", err
	}
	return true, "", nil
}

// Count は現在 registry にある active session 数を返す。
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

// CloseAll は process shutdown 時のactive sessionをsnapshotし、全cleanup完了まで待つ。
//
// reason省略時はprocess_shutdownを使う。ctx deadlineを超えた場合はctx.Errを返すが、done closeや
// registry removeを偽装せず、各Sessionのcleanup goroutineは完了まで継続する。registry lockは
// Close通知にも待機にも保持しないため、並行callbackを妨げない。
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
	m.config.Logger.Info("session registry updated", "session_id", sessionID, "active_sessions", activeSessions)
}
