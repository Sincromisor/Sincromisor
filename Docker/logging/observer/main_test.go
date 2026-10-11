package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// 状態ファイルの検証は、停止・再作成後に前回の健康状態を再利用しない収集判定の境界である。
func TestCollectorHealth(t *testing.T) {
	dir := t.TempDir()
	old := collectorStatePath
	collectorStatePath = filepath.Join(dir, "collector-health.json")
	t.Cleanup(func() { collectorStatePath = old })
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	o := observer{previous: map[string]string{}}
	if err := o.collectorHealth(now); err != errCollectorStateMissing {
		t.Fatal(err)
	}
	valid := `{"start_id":"01234567-89ab-cdef-0123-456789abcdef","checked_at":"2026-10-11T11:59:50Z","healthy":true,"reason":"available"}`
	if err := os.WriteFile(collectorStatePath, []byte(valid), 0600); err != nil {
		t.Fatal(err)
	}
	if err := o.collectorHealth(now); err != nil || o.collectorReady.Load() {
		t.Fatal(err)
	}
	if o.vectorStarted != "01234567-89ab-cdef-0123-456789abcdef" {
		t.Fatal(o.vectorStarted)
	}
	for _, body := range []string{
		`{"start_id":"bad","checked_at":"2026-10-11T11:59:50Z","healthy":true,"reason":"available"}`,
		`{"start_id":"01234567-89ab-cdef-0123-456789abcdef","checked_at":"2026-10-11T11:59:00Z","healthy":true,"reason":"available"}`,
		`{"start_id":"01234567-89ab-cdef-0123-456789abcdef","checked_at":"2026-10-11T12:00:10Z","healthy":true,"reason":"available"}`,
		`{"start_id":"01234567-89ab-cdef-0123-456789abcdef","checked_at":"2026-10-11T11:59:50Z","healthy":false,"reason":"journal_input_unavailable"}`,
		`{"start_id":"01234567-89ab-cdef-0123-456789abcdef","checked_at":"2026-10-11T11:59:50Z","healthy":true,"reason":"private-token"}`,
	} {
		if err := os.WriteFile(collectorStatePath, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		if err := o.collectorHealth(now); err == nil || o.vectorStarted != "" {
			t.Fatalf("状態を正常とした: %s", body)
		}
	}
}
