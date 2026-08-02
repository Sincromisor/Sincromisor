// Package resources は Gate 3 対象 process の procfs、Prometheus、status API を同時採取する。
//
// Sampler は採取 goroutine を単独所有し、失敗した観測回を sample 列へ混ぜず診断として保存する。
// Baseline と convergence は同じ Sample schema だけから決定する。
package resources
