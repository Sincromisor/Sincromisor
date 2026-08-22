// Package process は Gate 3 が起動する子 process の全 lifetime と有限量の出力を所有する。
//
// Owner は一度だけ Start でき、Wait の caller timeout と process cleanup を分離する。
// Close は SIGTERM、猶予後の SIGKILL、background waiter の join を必ず完了させる。
package process
