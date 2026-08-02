package resources

import (
	"errors"
	"time"
)

const (
	sampleInterval     = 250 * time.Millisecond
	convergenceTimeout = 10 * time.Second
	requiredStableRuns = 3
)

var (
	// ErrAlreadyStarted は idle 以外の Sampler を開始したことを表す。
	ErrAlreadyStarted = errors.New("resource sampler already started")
	// ErrStopped は停止済み Sampler を再開したことを表す。
	ErrStopped = errors.New("resource sampler is stopped")
)

// Queues は Prometheus の4つの固定 queue depthを item 数で保持する。
type Queues struct {
	Input  int64 `json:"input"`
	Speech int64 `json:"speech"`
	Text   int64 `json:"text"`
	Telop  int64 `json:"telop"`
}

// Sample は一回の全境界取得が成功した時だけ保存される観測値である。
//
// At は UTC、FDCount と SocketInodes は対象 PID、Sessions と Queues は同じ Pion の
// HTTP境界から得る。Goroutines は PID が現在の test process と同じ時だけ非 nil になる。
type Sample struct {
	At           time.Time `json:"at"`
	PID          int       `json:"pid"`
	FDCount      int       `json:"fd_count"`
	SocketInodes []uint64  `json:"socket_inodes"`
	Goroutines   *int      `json:"goroutines"`
	Sessions     int       `json:"sessions"`
	SessionLimit int       `json:"session_limit"`
	Ready        bool      `json:"ready"`
	Draining     bool      `json:"draining"`
	Queues       Queues    `json:"queues"`
}

// Diagnostic は sample として採用しなかった取得回の時刻と error を保存する。
type Diagnostic struct {
	At    time.Time `json:"at"`
	Error string    `json:"error"`
}

// Result は Sampler が停止時点で確定する JSON 保存可能な採取結果である。
type Result struct {
	Samples     []Sample     `json:"samples"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

// Baseline は readiness 後かつ session 開始前の3 sampleから求める上限比較の基準値である。
//
// 各 field は3 sampleの最大値であり、Goroutines は同一 process modeだけ非 nilである。
type Baseline struct {
	FDCount    int  `json:"fd_count"`
	Socket     int  `json:"socket_count"`
	Goroutines *int `json:"goroutines"`
}

// Config は Sampler が読む3つの外部境界を固定する。
//
// ProcRoot は通常 /proc、MetricsURL と StatusURL は対象 Pion の endpoint を絶対 URL で指定する。
type Config struct {
	PID        int
	ProcRoot   string
	MetricsURL string
	StatusURL  string
}
