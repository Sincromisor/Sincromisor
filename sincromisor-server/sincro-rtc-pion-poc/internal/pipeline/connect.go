package pipeline

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
)

// connectUntilRunning owns one generation's attempt counter. A failed initial
// or partial set stays in the same generation; only a fully activated set resets
// the counter by returning from this loop.
func (c *Coordinator) connectUntilRunning(initial bool) error {
	attempt := uint(0)
	for {
		c.mu.Lock()
		if c.state == StateClosed {
			c.mu.Unlock()
			return ErrClosed
		}
		ctx := c.sessionCtx
		sessionID, talkMode := c.sessionID, c.talkMode
		c.mu.Unlock()

		set, err := c.factory.Connect(ctx, sessionID, talkMode)
		c.mu.Lock()
		closed := c.state == StateClosed
		c.mu.Unlock()
		if closed {
			if set != nil {
				_ = set.Close()
			}
			return ErrClosed
		}
		if err == nil {
			c.mu.Lock()
			if c.state == StateClosed {
				c.mu.Unlock()
				_ = set.Close()
				return ErrClosed
			}
			err = c.validateSet(set)
			if err == nil {
				// Activate and running publication are performed while holding the
				// same state lock. Event handlers wait for unlock and therefore
				// classify the event as either building failure or runtime reset.
				generation := c.generation
				err = set.Activate(func(event pclient.Event) {
					c.onClientEvent(generation, event)
				})
			}
			if err == nil {
				workCtx, cancel := context.WithCancel(ctx)
				work := &generationWork{
					number: c.generation, ctx: workCtx, cancel: cancel,
					input: newFrameQueue(), conv: newConversation(sessionID),
				}
				c.set, c.work = set, work
				err = c.transitionLocked(StateRunning)
				if err == nil {
					c.startGenerationLocked(work, set)
				}
			}
			c.mu.Unlock()
			if err == nil {
				return nil
			}
			_ = set.Close()
		}
		attempt++
		delay, delayErr := c.retryDelay(attempt - 1)
		if delayErr != nil {
			_ = c.Close()
			return delayErr
		}
		if waitErr := <-c.wait(ctx, delay); waitErr != nil {
			if initial && ctx.Err() != nil {
				return ctx.Err()
			}
			return ErrClosed
		}
	}
}

func (c *Coordinator) validateSet(set ClientSet) error {
	if set == nil || set.Extractor() == nil || set.Recognizer() == nil ||
		set.Processor() == nil || set.Synthesizer() == nil {
		return errors.New("pipeline factory returned nil client set member")
	}
	return nil
}

func (c *Coordinator) startGenerationLocked(work *generationWork, set ClientSet) {
	work.wg.Add(5)
	go c.pcmLoop(work, set.Extractor())
	go c.extractorLoop(work, set.Extractor(), set.Recognizer())
	go c.recognizerLoop(work, set.Recognizer(), set.Processor())
	go c.processorLoop(work, set.Processor(), set.Synthesizer())
	go c.synthLoop(work, set.Synthesizer())
}

func (c *Coordinator) retryDelay(attempt uint) (time.Duration, error) {
	cap := RetryMin
	for index := uint(0); index < attempt && cap < RetryMax; index++ {
		if cap >= RetryMax/2 {
			cap = RetryMax
			break
		}
		cap *= 2
	}
	if cap > RetryMax {
		cap = RetryMax
	}
	return c.jitter(cap)
}

func cryptoJitter(cap time.Duration) (time.Duration, error) {
	if cap <= 0 {
		return 0, fmt.Errorf("retry cap must be positive")
	}
	value, err := rand.Int(rand.Reader, big.NewInt(int64(cap)+1))
	if err != nil {
		return 0, fmt.Errorf("generate retry jitter: %w", err)
	}
	return time.Duration(value.Int64()), nil
}

func realWait(ctx context.Context, delay time.Duration) <-chan error {
	result := make(chan error, 1)
	go func() {
		timer := time.NewTimer(delay)
		defer timer.Stop()
		select {
		case <-timer.C:
			result <- nil
		case <-ctx.Done():
			result <- ctx.Err()
		}
	}()
	return result
}
