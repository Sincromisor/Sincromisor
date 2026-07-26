package rtc

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"

	"github.com/oklog/ulid/v2"
	"github.com/pion/webrtc/v4"
)

// Offer は Frontend の initial Offer を Pion session 作成境界へ渡す。
type Offer struct {
	SDP      string
	Type     string
	TalkMode string
}

// Answer は candidate 収集済み SDP と server が払い出した ULID session ID を返す。
type Answer struct {
	SDP       string `json:"sdp"`
	Type      string `json:"type"`
	SessionID string `json:"session_id"`
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

// Manager は active PeerConnection の registry と process-wide shutdown を所有する。
//
// registry lock は map の参照だけを保護し、PeerConnection I/O や Close 待機中は保持しない。
// unknown と closed session は candidate endpoint で区別できるprocess-lifetime tombstoneとして保持する。
// TTL / 上限付きtombstoneはretry契約とともにPhase 3で設計する。
type Manager struct {
	mu            sync.RWMutex
	sessions      map[string]*Session
	closed        map[string]struct{}
	configuration webrtc.Configuration
	logger        *slog.Logger
}

// NewManager は optional STUN URL を反映した空の session registry を作成する。
//
// Manager は process shutdown 時に CloseAll を呼ぶ必要がある。TURN、固定 UDP mux、NAT rewrite は
// ローカル host candidate の PoC に含めない。
func NewManager(stunURL string, logger *slog.Logger) *Manager {
	configuration := webrtc.Configuration{}
	if stunURL != "" {
		configuration.ICEServers = []webrtc.ICEServer{{URLs: []string{stunURL}}}
	}
	return &Manager{
		sessions:      make(map[string]*Session),
		closed:        make(map[string]struct{}),
		configuration: configuration,
		logger:        logger,
	}
}

// Create は initial Offer から session を作り、half-trickle Answer を返す。
//
// remote description 検証、outbound track 登録、local Answer 作成後に candidate 収集完了を待つ。
// ctx timeout/cancellation または Pion error 時は session を close し registry に resource を残さない。
func (m *Manager) Create(ctx context.Context, offer Offer) (Answer, error) {
	if offer.Type != "offer" {
		return Answer{}, errors.New("offer type must be offer")
	}
	if strings.TrimSpace(offer.SDP) == "" {
		return Answer{}, errors.New("offer sdp is required")
	}
	sessionID := ulid.Make().String()
	session, err := newSession(sessionID, m.configuration, m.logger, m.remove)
	if err != nil {
		return Answer{}, err
	}
	m.mu.Lock()
	m.sessions[sessionID] = session
	m.mu.Unlock()

	answer, err := session.negotiate(ctx, offer.SDP)
	if err != nil {
		_ = session.Close("offer_failed")
		return Answer{}, err
	}
	return Answer{SDP: answer.SDP, Type: answer.Type.String(), SessionID: sessionID}, nil
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

// CloseAll は process shutdown 時に active session を snapshot して並行 callback と競合せず終了する。
//
// 各 Session の close-once が codec、ticker、PeerConnection、goroutine を統合して停止する。
func (m *Manager) CloseAll(reason string) error {
	m.mu.RLock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessions = append(sessions, session)
	}
	m.mu.RUnlock()
	var joined error
	for _, session := range sessions {
		joined = errors.Join(joined, session.Close(reason))
	}
	for _, session := range sessions {
		<-session.done
	}
	return joined
}

func (m *Manager) remove(sessionID string) {
	m.mu.Lock()
	delete(m.sessions, sessionID)
	m.closed[sessionID] = struct{}{}
	activeSessions := len(m.sessions)
	m.mu.Unlock()
	m.logger.Info("session registry updated", "session_id", sessionID, "active_sessions", activeSessions)
}
