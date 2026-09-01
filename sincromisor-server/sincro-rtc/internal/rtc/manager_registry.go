package rtc

import (
	"context"
	"errors"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
)

// Limit は初回Offer予約と状態取得で共有する不変の同時Session上限を返す。
// 資源や台帳の参照は行わない。
func (m *Manager) Limit() int { return m.maxSessions }

// Recorder は全Sessionと運用エンドポイントが共有する並行安全な観測先を返す。
// 起動後に呼び出し側が差し替えてはならない。
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

// CloseSession は既知SessionのHTTP更新panicを、そのSessionの一度限りの終了処理へ渡す。
// 未知または削除済みのSessionは処理しない。
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
