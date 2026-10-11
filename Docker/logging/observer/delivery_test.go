package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// sink以外の破棄・任意labelを混ぜず、欠落した指標や不正値を正常としない。
func TestDeliveryMetrics(t *testing.T) {
	raw := `vector_buffer_max_size_bytes{component_id="central"} 268435488
vector_buffer_size_bytes{component_id="central"} 1024
vector_component_sent_events_total{component_id="central"} 12
vector_component_discarded_events_total{component_id="central",intentional="true"} 3
vector_buffer_discarded_events_total{component_id="central"} 7
vector_component_discarded_events_total{component_id="unrelated"} 99
vector_component_errors_total{component_id="central",error_type="request_failed",private="secret"} 2
`
	values, err := deliveryMetrics(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if values["sent_events"] != 12 || values["discarded_events"] != 10 || values["errors"] != 2 || len(values) != 5 {
		t.Fatal(values)
	}
	for _, bad := range []string{"", strings.Replace(raw, "1024", "NaN", 1), strings.Replace(raw, "1024", "-1", 1)} {
		if _, err := deliveryMetrics(strings.NewReader(bad)); err == nil {
			t.Fatal("invalid metrics accepted")
		}
	}
}

// 配送監視は起動IDが同じ累計だけを比較する。旧保存形式、破棄、再試行、回復を
// Dockerなしで確認し、状態ファイルの再読がmetrics取得後にも必要な理由を固定する。
func TestDeliveryStateTransitions(t *testing.T) {
	dir := t.TempDir()
	oldState, oldGap, oldDelivery, oldNow := collectorStatePath, journalGapPath, deliveryStatePath, observerNow
	collectorStatePath, journalGapPath, deliveryStatePath = filepath.Join(dir, "collector.json"), filepath.Join(dir, "gap.json"), filepath.Join(dir, "delivery.json")
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	observerNow = func() time.Time { return now }
	t.Cleanup(func() {
		collectorStatePath, journalGapPath, deliveryStatePath, observerNow = oldState, oldGap, oldDelivery, oldNow
	})
	start := "01234567-89ab-cdef-0123-456789abcdef"
	writeState := func(id string) {
		if err := os.WriteFile(collectorStatePath, []byte(fmt.Sprintf(`{"start_id":"%s","checked_at":"%s","healthy":true,"reason":"available"}`, id, now.Format(time.RFC3339))), 0600); err != nil {
			t.Fatal(err)
		}
	}
	writeState(start)
	metrics := "vector_buffer_max_size_bytes{component_id=\"central\"} 10\nvector_buffer_size_events{component_id=\"central\"} 1\nvector_component_sent_events_total{component_id=\"central\"} 4\nvector_component_discarded_events_total{component_id=\"central\"} 0\nvector_component_errors_total{component_id=\"central\"} 0\n"
	changeDuringMetrics := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if changeDuringMetrics {
			writeState("fedcba98-7654-3210-fedc-ba9876543210")
			changeDuringMetrics = false
		}
		_, _ = w.Write([]byte(metrics))
	}))
	defer server.Close()
	target, _ := url.Parse(server.URL)
	transport := &http.Transport{Proxy: func(*http.Request) (*url.URL, error) { return target, nil }}
	defer transport.CloseIdleConnections()
	rows := []map[string]any{}
	o := observer{vector: &http.Client{Transport: transport}, previous: map[string]string{}, emit: func(row map[string]any) { rows = append(rows, row) }}
	if err := o.collectorHealth(now); err != nil {
		t.Fatal(err)
	}
	changeDuringMetrics = true
	if err := o.delivery(context.Background()); err == nil || err.Error() != "collector_restarted_during_metrics" {
		t.Fatal(err)
	}
	if err := o.collectorHealth(now); err != nil {
		t.Fatal(err)
	}
	if err := o.delivery(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 || rows[0]["event"] != "logging_loss_unknown" {
		t.Fatal(rows)
	}
	// 旧StartedAtはUUIDと一致しないため、累計を引き継がず再起動・不明区間として扱う。
	o.deliveryState = deliveryState{LastObserved: now.Add(-time.Minute).Format(time.RFC3339Nano), VectorStarted: now.Add(-time.Minute).Format(time.RFC3339), Sent: 99, Discarded: 99}
	if err := o.delivery(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !containsEvent(rows, "logging_recovery") {
		t.Fatal(rows)
	}
	metrics = strings.Replace(metrics, " 0\nvector_component_errors", " 2\nvector_component_errors", 1)
	if err := o.delivery(context.Background()); err == nil || err.Error() != "delivery_discarded" {
		t.Fatal(err)
	}
	metrics = strings.Replace(metrics, "} 4", "} 3", 1)
	metrics = strings.Replace(metrics, "} 1\nvector_component_sent", "} 2\nvector_component_sent", 1)
	metrics = strings.Replace(metrics, "} 0\n", "} 1\n", 1)
	if err := o.delivery(context.Background()); err == nil || err.Error() != "delivery_retrying" {
		t.Fatal(err)
	}
	metrics = strings.Replace(metrics, "} 3", "} 5", 1)
	if err := o.delivery(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func containsEvent(rows []map[string]any, event string) bool {
	for _, row := range rows {
		if row["event"] == event {
			return true
		}
	}
	return false
}
