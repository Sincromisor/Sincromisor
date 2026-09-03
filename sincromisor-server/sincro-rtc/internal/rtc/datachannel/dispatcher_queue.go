package datachannel

// Purge はgeneration barrierより前に取り込んだtext/telop eventを一括破棄する。
func (d *Dispatcher) Purge() {
	d.sendMu.Lock()
	defer d.sendMu.Unlock()
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return
	}
	d.purgeLocked()
	d.mu.Unlock()
}

// purgeLocked はキュー所有権を持つ呼び出し元の下で世代を進め、待機中の送信も失効させる。
func (d *Dispatcher) purgeLocked() {
	count := len(d.textQueue) + len(d.telopQueue)
	textCount, telopCount := len(d.textQueue), len(d.telopQueue)
	d.generationEpoch++
	close(d.generationChanged)
	d.generationChanged = make(chan struct{})
	d.textQueue = nil
	d.telopQueue = nil
	if textCount > 0 {
		d.recorder.QueueDepthDelta("text", -float64(textCount))
	}
	if telopCount > 0 {
		d.recorder.QueueDepthDelta("telop", -float64(telopCount))
	}
	if count > 0 {
		total := d.generationPurged.Add(uint64(count))
		d.logger.Info("purged data channel events",
			"stage", "data_channel_queue", "reason", "generation", "count", total,
		)
	}
}

// Stats は送信処理担当のペイロードを保持しない累積値と現在値を返す。
func (d *Dispatcher) Stats() Stats {
	d.mu.Lock()
	textQueued, telopQueued, closed := len(d.textQueue), len(d.telopQueue), d.closed
	d.mu.Unlock()
	return Stats{
		TextRejected:     d.textRejected.Load(),
		TelopDropped:     d.telopDropped.Load(),
		TelopSendDropped: d.telopSendDropped.Load(),
		GenerationPurged: d.generationPurged.Load(),
		ActiveWorkers:    d.activeWorkers.Load(),
		TextQueued:       textQueued,
		TelopQueued:      telopQueued,
		Closed:           closed,
	}
}

// pop はキューから1件を取り出し、送信直前に再検証する世代と更新通知を同時に返す。
func (d *Dispatcher) pop(text bool) ([]byte, uint64, <-chan struct{}, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	queue := &d.telopQueue
	if text {
		queue = &d.textQueue
	}
	if len(*queue) == 0 {
		return nil, 0, nil, false
	}
	payload := (*queue)[0]
	copy(*queue, (*queue)[1:])
	*queue = (*queue)[:len(*queue)-1]
	queueName := "telop"
	if text {
		queueName = "text"
	}
	d.recorder.QueueDepthDelta(queueName, -1)
	return payload, d.generationEpoch, d.generationChanged, true
}
