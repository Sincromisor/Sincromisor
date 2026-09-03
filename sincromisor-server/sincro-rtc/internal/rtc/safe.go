package rtc

import "context"

// Go はセッション所有のgoroutineを開始し、後始末で待ち合わせる。panicは回収した値を
// ログへ出さずに分類し、通常の失敗と同じ一度限りの終了処理へ収束させる。
func (s *Session) Go(stage string, run func(context.Context)) {
	if run == nil {
		return
	}
	s.wg.Add(1)
	s.goReserved(stage, run)
}

// goReservedは生存期間処理が状態ロック内でWaitGroupを予約した後に使う。
// これによりWait中にはAddしない不変条件を保つ。
func (s *Session) goReserved(stage string, run func(context.Context)) {
	go func() {
		defer s.wg.Done()
		defer func() {
			if recover() != nil {
				s.logger.Error("session goroutine panic", "session_id", s.id, "stage", stage, "reason", "panic")
				_ = s.Close("panic")
			}
		}()
		run(s.ctx)
	}()
}

// SafeCallback はPionまたはtimerのcallbackをセッション共通のpanic境界で包む。
// runtimeの致命的error、cgoの異常終了、包んでいない外部goroutineのpanicは対象外である。
func (s *Session) SafeCallback(stage string, callback func()) func() {
	return func() {
		defer func() {
			if recover() != nil {
				s.logger.Error("session callback panic", "session_id", s.id, "stage", stage, "reason", "panic")
				_ = s.Close("panic")
			}
		}()
		callback()
	}
}

// startCleanupは待機対象のSession WaitGroupには加わらず、終端資源の待ち合わせを開始する。
// 後始末補助のpanicはprocessへ伝播させず、Sessionは一度限りの終了処理ですでに利用不能である。
func (s *Session) startCleanup(reason string) {
	go func() {
		defer func() {
			if recover() != nil {
				s.logger.Error("session cleanup panic", "session_id", s.id, "stage", "cleanup", "reason", "panic")
			}
		}()
		s.cleanup(reason)
	}()
}
