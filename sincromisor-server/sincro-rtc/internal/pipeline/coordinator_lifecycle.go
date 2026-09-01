package pipeline

import (
	"context"
	"errors"
)

// Start は4 serviceが同じgenerationで揃うまで同期的に接続し、成功後にnilを返す。
//
// ctxはsession lifetimeを所有する。二重StartはErrAlreadyStarted、明示Closeと競合した初回接続は
// ErrClosed、caller cancellationはctx.Errを返す。
func (c *Coordinator) Start(ctx context.Context, sessionID, talkMode string) error {
	if ctx == nil || sessionID == "" || (talkMode != "chat" && talkMode != "sincro") {
		return errors.New("pipeline start arguments are invalid")
	}
	c.mu.Lock()
	if c.state == StateClosed {
		c.mu.Unlock()
		return ErrClosed
	}
	if c.started {
		c.mu.Unlock()
		return ErrAlreadyStarted
	}
	c.started = true
	c.sessionID, c.talkMode, c.generation = sessionID, talkMode, 1
	c.sessionCtx, c.cancel = context.WithCancel(ctx)
	if err := c.transitionLocked(StateConnecting); err != nil {
		c.mu.Unlock()
		return err
	}
	c.wg.Add(1)
	c.goCoordinator("pipeline_context", c.closeOnContext)
	c.mu.Unlock()

	err := c.connectUntilRunning(true)
	if err != nil {
		if ctx.Err() != nil {
			_ = c.Close()
			return ctx.Err()
		}
		return err
	}
	return nil
}

func (c *Coordinator) closeOnContext() {
	<-c.sessionCtx.Done()
	// Closeは全session goroutineを待つため、この監視workerがwait groupを抜けた後に別callerでjoinする。
	c.goDetached("pipeline_close", func() { _ = c.Close() })
}

// Close はclosedを先に確定し、retry、generation、4 clientをcancel / joinして再接続を禁止する。
//
// 全producer終了後、publication/resetと共有するoutput barrier内でtext、synth、generationの順にchannelをcloseする。
// Close開始前にpublishへ入ったpackage内callerもbarrierから退出するまで待つため、全stateから
// idempotentかつsend/close raceなしで呼べる。
func (c *Coordinator) Close() error {
	c.closeOnce.Do(func() {
		c.mu.Lock()
		if c.state != StateClosed {
			_ = c.transitionLocked(StateClosed)
		}
		cancel, work, set := c.cancel, c.work, c.set
		c.work, c.set = nil, nil
		c.mu.Unlock()
		if cancel != nil {
			cancel()
		}
		if work != nil {
			work.cancel()
			work.input.close()
		}
		if set != nil {
			_ = set.Close()
		}
		if work != nil {
			work.wg.Wait()
		}
		c.wg.Wait()
		// generation workerのjoinは通常producerを全て覆う。それに加えてoutputMuを
		// channel closeの最終barrierにすることで、test hookを含むpackage内の直接
		// publicationがClose開始時点で進行中でもsend/closeを直列化する。
		c.outputMu.Lock()
		close(c.textOut)
		close(c.synthOut)
		close(c.generationChanges)
		c.outputMu.Unlock()
		close(c.closeDone)
	})
	<-c.closeDone
	return nil
}

func (c *Coordinator) transitionLocked(to State) error {
	if !validTransition(c.state, to) {
		err := &TransitionError{From: c.state, To: to}
		c.logger.Error("rejected pipeline state transition", "stage", "pipeline_state", "reason", "invalid_transition")
		return err
	}
	c.state = to
	return nil
}
