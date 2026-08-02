package rtc

import "context"

// Go starts a session-owned goroutine and joins it during cleanup. A panic is
// classified without logging the recovered value, then converges on the same
// close-once lifecycle as ordinary failures.
func (s *Session) Go(stage string, run func(context.Context)) {
	if run == nil {
		return
	}
	s.wg.Add(1)
	s.goReserved(stage, run)
}

// goReserved is used after lifecycle code has reserved a WaitGroup slot under
// its state lock. This preserves the no-Add-during-Wait invariant.
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

// SafeCallback wraps a Pion or timer callback with the same session panic
// boundary. Runtime fatal errors, cgo crashes, and panics in unwrapped
// third-party goroutines remain outside this boundary.
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

// startCleanup launches the terminal resource join outside the Session
// WaitGroup it must wait on. Panic containment prevents a cleanup helper from
// crashing the process; close-once has already made the Session unavailable.
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
