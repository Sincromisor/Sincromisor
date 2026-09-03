package pipeline

import (
	"errors"
	"sync"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

// resetCauseRuntimeError は処理ループの失敗を有限なclient EventKind値と区別する。
const resetCauseRuntimeError = "runtime_error"

func (c *Coordinator) onClientEvent(generation uint64, event pclient.Event) {
	c.requestReset(generation, event.Service, string(event.Kind))
}

// requestResetはprotocol、I/O、送信抑制の全失敗を一本化する境界である。causeにはerrorではなく
// 運用上の分類だけを受け取り、ログへpipelineの内容を漏らさない。旧clientを閉じる前に世代を進め、
// 並行して届いたcallbackを直ちに期限切れとして扱う。
func (c *Coordinator) requestReset(generation uint64, service pclient.Service, cause string) {
	if service == "" {
		return
	}
	c.mu.Lock()
	if c.state != StateRunning || c.generation != generation || c.resetting {
		c.mu.Unlock()
		c.recordStaleDrop(service)
		return
	}
	c.resetting = true
	c.logger.Warn("pipeline_reset_requested",
		"stage", "pipeline_reset_requested", "session_id", c.sessionID,
		"service", string(service), "cause", cause, "generation", generation)
	if err := c.transitionLocked(StateResetting); err != nil {
		c.mu.Unlock()
		return
	}
	// 状態ロックを解放する前に再初期化の所有者を登録する。CloseもWait前に同じロックを取るため、
	// WaitGroup.AddとWaitは競合しない。
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

	// 出力公開と再初期化は同じ順序でロックを取る。resettingが見えた後は新しい生成側を受理せず、
	// この境界内で世代更新と旧envelopeの除去を消費側へ一括公開する。
	c.outputMu.Lock()
	c.mu.Lock()
	// resettingの公開後、この出力境界を得る前にCloseが先行できる。世代の作業を参照する前に
	// 所有権を再確認し、その順序でもCloseだけが待ち合わせを所有する。
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
		// 段階ループ自身が再初期化を要求する場合がある。そのループが戻ってからCloseが
		// generationWorkを待てるよう、終端不変条件の後始末は別goroutineで完了させる。
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
			// 受理した各再初期化は、終了、callbackのpanic、再接続取消を含めて
			// 終端結果を必ず1回だけ記録する。
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

// recordStaleDropはイベント発生元と単調増加する件数だけを意図的に記録する。
// 結果payloadと原因errorは音声や会話内容を含み得るため、この観測境界を越えさせない。
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
