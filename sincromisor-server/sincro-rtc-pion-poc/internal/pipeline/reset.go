package pipeline

import (
	"errors"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
)

func (c *Coordinator) onClientEvent(event pclient.Event) {
	c.mu.Lock()
	generation := c.generation
	c.mu.Unlock()
	c.requestReset(generation, event.Service, event.Err)
}

// requestReset is the single-flight boundary for every protocol, I/O, and
// backpressure failure. Generation advances before old clients are closed so
// concurrently delivered callbacks become stale immediately.
func (c *Coordinator) requestReset(generation uint64, service pclient.Service, reason error) {
	c.mu.Lock()
	if c.state != StateRunning || c.generation != generation || c.resetting {
		c.mu.Unlock()
		c.logger.Info("dropped stale pipeline event", "service", service)
		return
	}
	c.resetting = true
	if err := c.transitionLocked(StateResetting); err != nil {
		c.mu.Unlock()
		return
	}
	// Register the reset owner before releasing stateMu. Close takes the same
	// lock before Wait, so WaitGroup.Add can never race with Wait.
	c.wg.Add(1)
	c.mu.Unlock()

	// Output publication and reset take locks in the same order. Once resetting
	// is visible no new producer is accepted; this barrier advances generation
	// and removes buffered old envelopes atomically for consumers.
	c.outputMu.Lock()
	c.mu.Lock()
	next, err := nextGeneration(c.generation)
	if err != nil {
		_ = c.transitionLocked(StateClosed)
		cancel := c.cancel
		c.mu.Unlock()
		c.outputMu.Unlock()
		c.wg.Done()
		if cancel != nil {
			cancel()
		}
		// A stage loop may be the reset caller. It must return before Close joins
		// generationWork, so terminal invariant cleanup is completed asynchronously.
		go func() { _ = c.Close() }()
		return
	}
	oldWork, oldSet := c.work, c.set
	c.work, c.set = nil, nil
	c.generation = next
	drain(c.textOut)
	drain(c.synthOut)
	c.mu.Unlock()
	c.outputMu.Unlock()

	go func() {
		defer c.wg.Done()
		oldWork.cancel()
		oldWork.input.close()
		_ = oldSet.Close()
		oldWork.wg.Wait()
		c.mu.Lock()
		if c.state == StateClosed {
			c.resetting = false
			c.mu.Unlock()
			return
		}
		_ = c.transitionLocked(StateConnecting)
		c.resetting = false
		c.mu.Unlock()
		if err := c.connectUntilRunning(false); err != nil && !errors.Is(err, ErrClosed) {
			c.logger.Error("pipeline reconnect stopped", "error", err, "reason", reason)
		}
	}()
}

func drain[T any](values chan T) {
	for {
		select {
		case <-values:
		default:
			return
		}
	}
}
