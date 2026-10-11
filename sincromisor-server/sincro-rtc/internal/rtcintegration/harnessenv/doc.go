// Package harnessenv はRTC統合試験を開始する前に固定入力と外部実行ファイルを検査する。
//
// Loadが返すEnvironmentだけを後続パッケージへ渡し、検証途中の暗黙なPATH探索や、
// シンボリックリンクによるリポジトリ内の入力の差し替えを防ぐ。
package harnessenv
