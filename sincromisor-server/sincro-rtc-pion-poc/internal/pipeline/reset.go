package pipeline

import (
	"errors"
	"sync"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
)

func (c *Coordinator) onClientEvent(generation uint64, event pclient.Event) {
	c.requestReset(generation, event.Service, event.Err)
}

// requestReset is the single-flight boundary for every protocol, I/O, and
// backpressure failure. Generation advances before old clients are closed so
// concurrently delivered callbacks become stale immediately.
func (c *Coordinator) requestReset(generation uint64, service pclient.Service, reason error) {
	c.mu.Lock()
	if c.state != StateRunning || c.generation != generation || c.resetting {
		c.mu.Unlock()
		c.recordStaleDrop(service)
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
	c.observer.PipelineReconnect(string(service), "start")
	c.mu.Unlock()
	var terminalOnce sync.Once
	finish := func(result string) {
		terminalOnce.Do(func() {
			c.observer.PipelineReconnect(string(service), result)
		})
	}
	handedOff := false
	defer func() {
		if !handedOff {
			finish("failure")
		}
	}()

	// Output publication and reset take locks in the same order. Once resetting
	// is visible no new producer is accepted; this barrier advances generation
	// and removes buffered old envelopes atomically for consumers.
	c.outputMu.Lock()
	c.mu.Lock()
	// Close can win after resetting becomes visible but before this output
	// barrier is acquired. Recheck ownership before dereferencing generation
	// work so the close path remains the sole join owner in that ordering.
	if c.state == StateClosed || c.generation != generation || c.work == nil || c.set == nil {
		c.resetting = false
		c.mu.Unlock()
		c.outputMu.Unlock()
		c.wg.Done()
		return
	}
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
		c.goDetached("pipeline_terminal_close", func() { _ = c.Close() })
		return
	}
	oldWork, oldSet := c.work, c.set
	c.work, c.set = nil, nil
	c.generation = next
	drain(c.textOut)
	drain(c.synthOut)
	c.notifyGeneration(next)
	c.mu.Unlock()
	c.outputMu.Unlock()

	handedOff = true
	c.goCoordinator("pipeline_reconnect", func() {
		result := "failure"
		defer func() {
			// Every accepted reset has exactly one terminal result, including
			// shutdown, callback panic, and reconnect cancellation exits.
			finish(result)
		}()
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
		if err := c.connectUntilRunning(false); err != nil {
			if !errors.Is(err, ErrClosed) {
				c.logger.Error("pipeline reconnect stopped", "stage", string(service), "reason", "reconnect_failure")
			}
			return
		}
		result = "success"
	})
}

// notifyGenerationはoutputMuを保持するcallerからcapacity 1の最新generation通知を確定する。
//
// channelが満杯なら古い値を1件だけ除いて置換する。reset/publishと同じbarrier内で呼ぶため、
// drain後の通知より古いenvelopeがCoordinator queueへ再混入しない。
func (c *Coordinator) notifyGeneration(generation uint64) {
	select {
	case c.generationChanges <- generation:
		return
	default:
	}
	select {
	case <-c.generationChanges:
	default:
	}
	c.generationChanges <- generation
}

func (c *Coordinator) isCurrentGeneration(generation uint64, service pclient.Service) bool {
	c.mu.Lock()
	current := c.state == StateRunning && c.generation == generation
	c.mu.Unlock()
	if !current {
		c.recordStaleDrop(service)
	}
	return current
}

// recordStaleDrop deliberately logs only the event source and monotonic count.
// Result payloads and causal errors can contain speech or conversation data and
// must not cross this observability boundary.
func (c *Coordinator) recordStaleDrop(service pclient.Service) {
	c.mu.Lock()
	c.staleDrops[service]++
	count := c.staleDrops[service]
	c.mu.Unlock()
	c.logger.Info("dropped stale pipeline value", "stage", service, "reason", "stale_generation", "count", count)
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
