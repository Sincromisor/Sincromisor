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

// frameQueue is the sole telemetry owner for queued input frames. push, pop,
// and close change the in-memory slice and Prometheus gauge under one mutex;
// Coordinator reset/close therefore cannot release an item already transferred
// to pcmLoop, and every closed generation converges to zero.
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

// pop transfers exactly one queued frame from telemetry ownership to the
// extractor. The queue lock covers both slice removal and the -1 observation,
// so reset/close cannot release the same frame concurrently.
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

// close atomically releases every still-owned frame and wakes blocked
// consumers. Because pop uses the same lock, the gauge decrement describes
// only frames that no consumer has already acquired.
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
