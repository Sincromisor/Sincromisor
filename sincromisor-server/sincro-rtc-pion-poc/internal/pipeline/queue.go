package pipeline

import "sync"

const (
	pcmFrameBytes       = 640
	inputQueueCapacity  = 25
	outputQueueCapacity = 16
)

type frameQueue struct {
	mu     sync.Mutex
	values chan []byte
	closed bool
	drops  uint64
}

func newFrameQueue() *frameQueue {
	return &frameQueue{values: make(chan []byte, inputQueueCapacity)}
}

func (q *frameQueue) push(frame []byte) (bool, uint64) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return false, q.drops
	}
	select {
	case q.values <- frame:
		return false, q.drops
	default:
	}
	// Browser audio is latency-sensitive: retain the newest 500 ms instead of
	// allowing an old backlog to shift the conversation in time.
	select {
	case <-q.values:
		q.drops++
	default:
	}
	q.values <- frame
	return true, q.drops
}

func (q *frameQueue) close() {
	q.mu.Lock()
	if !q.closed {
		q.closed = true
		close(q.values)
	}
	q.mu.Unlock()
}
