// Package diagnostics は例外値を含まない障害位置を処理境界間で受け渡す。
package diagnostics

import (
	"path/filepath"
	"runtime"
)

// Frame は引数・絶対パス・ソースを含まない1つの発生位置である。
type Frame struct {
	Function string `json:"function"`
	File     string `json:"file"`
	Line     int    `json:"line"`
}

// Panic は回収した値を保持せず、終端イベントへ安全な位置だけを引き継ぐ。
type Panic struct{ Frames []Frame }

// Error はログ以外の通常エラー経路でもpanic値を展開させない。
func (*Panic) Error() string { return "recovered panic" }

// CapturePanic はrecoverのdeferまたはそこから同期呼出しした通知先で使う。
// 同じgoroutineの発生箇所側から最大32フレームを取り、終了後の別goroutineでは取り直さない。
func CapturePanic() *Panic {
	var pcs [32]uintptr
	count := runtime.Callers(2, pcs[:])
	frames := runtime.CallersFrames(pcs[:count])
	result := &Panic{Frames: make([]Frame, 0, count)}
	for {
		frame, more := frames.Next()
		result.Frames = append(result.Frames, Frame{Function: frame.Function, File: filepath.Base(frame.File), Line: frame.Line})
		if !more {
			break
		}
	}
	return result
}
