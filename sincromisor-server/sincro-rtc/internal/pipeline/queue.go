package pipeline

import (
	"context"
	"sync"
)

const (
	pcmFrameBytes       = 640
	inputQueueCapacity  = 25
	outputQueueCapacity = 16
)

// frameQueueは待機中の入力フレームと観測値を一意に所有する。push、pop、closeは同じmutex内で
// スライスとPrometheus gaugeを変更するため、Coordinatorの再初期化や終了がpcmLoopへ移譲済みの
// フレームを重ねて解放せず、終了した各世代の観測値は0へ収束する。
type frameQueue struct {
	mu       sync.Mutex
	values   [][]byte
	wake     chan struct{}
	closed   bool
	observer Observer
}

func newFrameQueue(observers ...Observer) *frameQueue {
	var observer Observer = discardObserver{}
	if len(observers) > 0 && observers[0] != nil {
		observer = observers[0]
	}
	return &frameQueue{
		values:   make([][]byte, 0, inputQueueCapacity),
		wake:     make(chan struct{}, 1),
		observer: observer,
	}
}

func (q *frameQueue) push(frame []byte) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return false
	}
	dropped := len(q.values) == inputQueueCapacity
	if dropped {
		copy(q.values, q.values[1:])
		q.values[len(q.values)-1] = frame
		q.observer.QueueOverflow("input", "drop_oldest")
	} else {
		q.values = append(q.values, frame)
		q.observer.QueueDepthDelta("input", 1)
	}
	select {
	case q.wake <- struct{}{}:
	default:
	}
	return dropped
}

// popは待機中の1フレームだけを観測上の所有対象から抽出器へ移譲する。キューロックが
// スライスからの除去と観測値の減算を覆うため、再初期化や終了は同じフレームを並行して解放しない。
func (q *frameQueue) pop(ctx context.Context) ([]byte, bool) {
	for {
		q.mu.Lock()
		if len(q.values) > 0 {
			frame := q.values[0]
			copy(q.values, q.values[1:])
			q.values[len(q.values)-1] = nil
			q.values = q.values[:len(q.values)-1]
			q.observer.QueueDepthDelta("input", -1)
			q.mu.Unlock()
			return frame, true
		}
		if q.closed {
			q.mu.Unlock()
			return nil, false
		}
		wake := q.wake
		q.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, false
		case <-wake:
		}
	}
}

// closeは所有中の全フレームを一括解放し、待機中の消費側を起こす。popと同じロックを使うため、
// 観測値から減らすのは消費側へまだ移譲されていないフレームだけである。
func (q *frameQueue) close() {
	q.mu.Lock()
	remaining := len(q.values)
	if !q.closed {
		q.closed = true
		q.values = nil
		if remaining > 0 {
			q.observer.QueueDepthDelta("input", -float64(remaining))
		}
		close(q.wake)
	}
	q.mu.Unlock()
}
