package datachannel

import (
	"errors"
	"fmt"
	"time"

	"github.com/pion/webrtc/v4"
)

// run は1チャネルの送信を直列化し、textの失敗だけをセッション終了へ伝播する。
// telopは信頼性なしのため単発送信失敗を記録して次のイベントを処理する。
func (d *Dispatcher) run(channel channelWriter, text bool, wake <-chan struct{}) {
	d.activeWorkers.Add(1)
	defer func() {
		if recover() != nil {
			d.recoverPanic("data_channel_worker")
		}
		d.activeWorkers.Add(-1)
		d.wg.Done()
	}()
	for {
		payload, epoch, generationChanged, ok := d.pop(text)
		if !ok {
			select {
			case <-d.ctx.Done():
				return
			case <-wake:
				continue
			}
		}
		if err := d.waitWritable(channel, generationChanged); err != nil {
			if errors.Is(err, errStaleDataChannelEvent) {
				continue
			}
			d.onError(err)
			return
		}
		sendErr, stale := func() (error, bool) {
			d.sendMu.Lock()
			defer d.sendMu.Unlock()
			d.mu.Lock()
			stale := epoch != d.generationEpoch
			d.mu.Unlock()
			if stale {
				return nil, true
			}
			return channel.SendText(string(payload)), false
		}()
		if stale {
			continue
		}
		if sendErr != nil {
			if text {
				d.recorder.DataChannelError("text")
				d.onError(fmt.Errorf("send reliable text data channel payload: %w", sendErr))
				return
			}
			d.recorder.DataChannelError("telop")
			count := d.telopSendDropped.Add(1)
			d.logger.Warn("dropped data channel event",
				"stage", "telop", "reason", "data_channel_error", "count", count,
			)
		}
	}
}

// waitWritableは1 MiB high-waterで送信を止め、256 KiB low-water eventまで最大5秒待つ。
//
// callbackは通知をcoalesceするだけで、復帰判定はBufferedAmountを再読してspurious/古いeventを拒否する。
func (d *Dispatcher) waitWritable(
	channel channelWriter,
	generationChanged <-chan struct{},
) error {
	if channel.ReadyState() != webrtc.DataChannelStateOpen {
		return errors.New("data channel is closed")
	}
	if channel.BufferedAmount() < bufferedAmountHigh {
		return nil
	}
	timer := time.NewTimer(d.backpressureTimeout)
	defer timer.Stop()
	low := make(chan struct{}, 1)
	channel.OnBufferedAmountLow(d.safeCallback("data_channel_backpressure", func() { signal(low) }))
	for {
		if channel.ReadyState() != webrtc.DataChannelStateOpen {
			return errors.New("data channel closed during backpressure")
		}
		if channel.BufferedAmount() <= bufferedAmountLow {
			return nil
		}
		select {
		case <-d.ctx.Done():
			return d.ctx.Err()
		case <-generationChanged:
			return errStaleDataChannelEvent
		case <-timer.C:
			return errors.New("data channel backpressure timeout")
		case <-low:
		}
	}
}
