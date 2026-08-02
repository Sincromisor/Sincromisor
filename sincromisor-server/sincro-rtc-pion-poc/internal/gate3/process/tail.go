package process

import "sync"

// tailBuffer は出力 producer ごとに独立した有限 buffer を所有する。
// 上限超過時は古い byte だけを捨て、終了診断に有用な末尾を残す。上限の変更リスクと
// 確認境界は、公開結果の契約を持つ Output のコメントに集約する。
type tailBuffer struct {
	mu        sync.Mutex
	limit     int
	data      []byte
	truncated bool
}

func newTailBuffer(limit int) *tailBuffer {
	return &tailBuffer{limit: limit, data: make([]byte, 0, limit)}
}

func (b *tailBuffer) Write(data []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	written := len(data)
	if len(data) >= b.limit {
		hadData := len(b.data) > 0
		b.data = append(b.data[:0], data[len(data)-b.limit:]...)
		b.truncated = b.truncated || hadData || len(data) > b.limit
		return written, nil
	}
	overflow := len(b.data) + len(data) - b.limit
	if overflow > 0 {
		copy(b.data, b.data[overflow:])
		b.data = b.data[:len(b.data)-overflow]
		b.truncated = true
	}
	b.data = append(b.data, data...)
	return written, nil
}

func (b *tailBuffer) output() Output {
	b.mu.Lock()
	defer b.mu.Unlock()
	return Output{Data: append([]byte(nil), b.data...), Truncated: b.truncated}
}
