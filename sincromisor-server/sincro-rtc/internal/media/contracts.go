// Package media は送信音声の符号化、時刻管理、テロップ生成を担当する。
package media

import "time"

const (
	// SampleRate は送信OpusとRTP clockの周波数をHzで表す。
	SampleRate = 48000
	// FrameDuration は送信符号化とRTP pacingが共有するOpus frame時間である。
	FrameDuration = 20 * time.Millisecond
	frameSamples  = SampleRate / 50
)
