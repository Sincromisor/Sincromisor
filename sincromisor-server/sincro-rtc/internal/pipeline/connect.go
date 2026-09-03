package pipeline

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

// connectUntilRunningは1世代の接続試行回数を所有する。初期接続または一部の接続に失敗しても
// 同じ世代を維持し、全接続を有効化できた場合だけループを抜けて試行回数を破棄する。
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
				// 有効化と稼働状態の公開を同じ状態ロック内で行う。イベント処理は解放まで待つため、
				// 接続構築中の失敗と稼働後の再初期化を取り違えない。
				generation := c.generation
				err = set.Activate(func(event pclient.Event) {
					c.safeCallback("pipeline_client_event", func() {
						c.onClientEvent(generation, event)
					})
				})
			}
			if err == nil {
				workCtx, cancel := context.WithCancel(ctx)
				work := &generationWork{
					number: c.generation, ctx: workCtx, cancel: cancel,
					input: newFrameQueue(c.observer), conv: newConversation(sessionID),
				}
				c.set, c.work = set, work
				err = c.transitionLocked(StateRunning)
				if err == nil {
					if initial {
						// 初回producerを開始する前にgeneration streamを確定する。ここではまだ
						// generation goroutineが存在せず、outputMuを待つproducer/resetはない。
						c.outputMu.Lock()
						c.notifyGeneration(c.generation)
						c.startGenerationLocked(work, set)
						c.outputMu.Unlock()
					} else {
						c.startGenerationLocked(work, set)
					}
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
	c.goWork(work, "pipeline_pcm", func() { c.pcmLoop(work, set.Extractor()) })
	c.goWork(work, "pipeline_extractor", func() { c.extractorLoop(work, set.Extractor(), set.Recognizer()) })
	c.goWork(work, "pipeline_recognizer", func() { c.recognizerLoop(work, set.Recognizer(), set.Processor()) })
	c.goWork(work, "pipeline_processor", func() { c.processorLoop(work, set.Processor(), set.Synthesizer()) })
	c.goWork(work, "pipeline_synthesizer", func() { c.synthLoop(work, set.Synthesizer()) })
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
		defer func() {
			if recover() != nil {
				result <- errors.New("pipeline retry waiter panic")
			}
		}()
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
