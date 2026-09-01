package rtc

import (
	"errors"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
)

// Close はclosingを一度だけ確定し、全所有資源の非同期後始末を開始する。
//
// タイマー停止とコンテキスト中止は返却前に完了する。PeerConnection、符号器、出力処理、
// DataChannel、会話処理を閉じて全担当処理を待った後だけ、台帳削除とdoneのcloseを行う。
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
	if s.notifyClosed() {
		reason = "panic"
	}
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
	close(s.done)
}

// notifyClosed はSessionの後始末完了をManagerとOfferレジストリの生存期間コールバックへ通知する。
//
// コールバックのpanicはここで分類し、稼働セッション観測、終了時間、Doneの公開を必ず完了させる。
func (s *Session) notifyClosed() (panicked bool) {
	defer func() {
		if recover() != nil {
			panicked = true
			s.logger.Error("session close callback panic", "session_id", s.id, "stage", "session_on_closed", "reason", "panic")
		}
	}()
	s.onClosed(s.id)
	return false
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
