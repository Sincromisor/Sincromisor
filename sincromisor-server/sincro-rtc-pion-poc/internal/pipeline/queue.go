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
}

func newFrameQueue() *frameQueue {
	return &frameQueue{values: make(chan []byte, inputQueueCapacity)}
}

func (q *frameQueue) push(frame []byte) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return false
	}
	select {
	case q.values <- frame:
		return false
	default:
	}
	// Browser audio is latency-sensitive: retain the newest 500 ms instead of
	// allowing an old backlog to shift the conversation in time.
	select {
	case <-q.values:
	default:
	}
	q.values <- frame
	return true
}

func (q *frameQueue) close() int {
	q.mu.Lock()
	remaining := len(q.values)
	if !q.closed {
		q.closed = true
		close(q.values)
	}
	q.mu.Unlock()
	return remaining
}
