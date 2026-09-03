package pipeline

import "sync"

// recordingPipelineObserver はキュー所有数と再接続の終端結果だけを試験用に記録する。
type recordingPipelineObserver struct {
	mu         sync.Mutex
	queueDepth float64
	minimum    float64
	reconnects chan string
	overflows  int
}

func (r *recordingPipelineObserver) PipelineReconnect(_ string, result string) {
	if r.reconnects != nil {
		r.reconnects <- result
	}
}

func (r *recordingPipelineObserver) QueueDepthDelta(_ string, delta float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.queueDepth += delta
	if r.queueDepth < r.minimum {
		r.minimum = r.queueDepth
	}
}

func (r *recordingPipelineObserver) QueueOverflow(string, string) {
	r.mu.Lock()
	r.overflows++
	r.mu.Unlock()
}

func (r *recordingPipelineObserver) queueSnapshot() (float64, float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.queueDepth, r.minimum
}
