// Package protocol は、Go RTC pipeline と既存 Python service の間で使う
// MessagePack wire contract を限定 DTO へ変換する。
//
// WebSocket の接続・再試行・lifecycle は後続の client package が担い、この package は
// 1 payload の encode/decode、presence/type 検証、受信 byte 列の所有権分離だけを担う。
package protocol
