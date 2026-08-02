// Package report は Gate 3 の判定 document を検証し、既存 file を上書きせず原子的に公開する。
//
// Writer は同一 directory の fsync 済み一時 file を hard link してから削除し、
// directory を fsync する。scenario cleanup は document を渡す前に caller が確定する。
package report
