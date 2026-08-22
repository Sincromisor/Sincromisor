// Package harnessenv は Gate 3 を開始する前に固定入力と外部実行ファイルを検査する。
//
// Load が返す Environment だけを後続 package へ渡すことで、検証途中の暗黙な PATH 探索や
// symlink による repository 所有入力の差し替えを防ぐ。
package harnessenv
