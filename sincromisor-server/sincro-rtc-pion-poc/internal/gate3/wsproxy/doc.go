// Package wsproxy は Gate 3 用の有限 WebSocket 障害 proxy を提供する。
//
// 各 proxy は透過状態で開始する。scenario は request/response 交換間だけ有限規則列を arm でき、
// 最初に一致した交換が規則を1件消費して後続 upgrade を固定回数だけ拒否する。
package wsproxy
