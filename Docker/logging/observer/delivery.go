// 配送の累計と原本消失を観測し、読取位置やログ本文そのものは所有しない。
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// deliveryStateは監視再作成をまたぐ観測時刻と累計だけを保存し、ログ本文を持たない。
type deliveryState struct {
	LastObserved, LastSuccess, VectorStarted string
	Sent, Discarded, Errors                  float64
}

// deliveryMetricsは固定版Vectorの中央sinkだけを読む。任意labelや指標名は出力しない。
func deliveryMetrics(reader io.Reader) (map[string]float64, error) {
	names := map[string]string{
		"vector_buffer_size_bytes": "buffer_bytes", "vector_buffer_max_size_events": "buffer_limit_events",
		"vector_buffer_max_size_bytes": "buffer_limit_bytes",
		"vector_buffer_size_events":    "buffer_events", "vector_component_sent_events_total": "sent_events",
		"vector_component_discarded_events_total": "discarded_events", "vector_buffer_discarded_events_total": "discarded_events",
		"vector_component_errors_total": "errors",
	}
	values := map[string]float64{}
	scanner := bufio.NewScanner(io.LimitReader(reader, 2<<20))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.Contains(line, `component_id="central"`) {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		name, _, ok := strings.Cut(parts[0], "{")
		if !ok {
			continue
		}
		field, ok := names[name]
		if !ok {
			continue
		}
		value, err := strconv.ParseFloat(parts[1], 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return nil, fmt.Errorf("metrics_invalid")
		}
		values[field] += value
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("metrics_invalid")
	}
	if _, ok := values["buffer_limit_bytes"]; !ok {
		if _, ok := values["buffer_limit_events"]; !ok {
			return nil, fmt.Errorf("metrics_missing")
		}
	}
	return values, nil
}

// deliveryは中央受理・滞留・破棄と観測不在を記録し、不明な欠落を0と推測しない。
func (o *observer) delivery(ctx context.Context) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://vector:9598/metrics", nil)
	if err != nil {
		return fmt.Errorf("metrics_request_invalid")
	}
	response, err := o.consul.Do(req)
	if err != nil {
		return fmt.Errorf("collector_metrics_unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("collector_metrics_unavailable")
	}
	values, err := deliveryMetrics(response.Body)
	if err != nil {
		return err
	}
	prior := o.deliveryState
	if prior.VectorStarted != "" && prior.VectorStarted != o.vectorStarted {
		o.changed("delivery:restart", map[string]any{"event": "logging_recovery", "reason": "collector_restarted", "from": prior.LastObserved, "to": now, "loss_count": nil, "replay_possible": true})
		prior.Sent = 0
		prior.Discarded = 0
		prior.Errors = 0
	}
	if values["sent_events"] > prior.Sent {
		o.deliveryState.LastSuccess = now
	}
	if prior.LastObserved == "" {
		// Dockerのnon-blockingメモリバッファには破棄数の公開指標がない。原本以前は常に未計測と明示する。
		o.changed("delivery:unmeasured", map[string]any{"event": "logging_loss_unknown", "reason": "docker_buffer_unmeasured", "from": now, "loss_count": nil})
	}
	row := map[string]any{"event": "logging_delivery", "last_success_observed_at": o.deliveryState.LastSuccess, "loss_count": nil}
	for key, value := range values {
		row[key] = value
	}
	o.changed("delivery:metrics", row)
	if values["discarded_events"] > prior.Discarded {
		o.changed("delivery:discard", map[string]any{"event": "logging_discarded", "count": values["discarded_events"] - prior.Discarded, "from": prior.LastObserved, "to": now})
	}
	o.deliveryState = deliveryState{LastObserved: now, LastSuccess: o.deliveryState.LastSuccess, VectorStarted: o.vectorStarted, Sent: values["sent_events"], Discarded: values["discarded_events"], Errors: values["errors"]}
	if err := o.saveDelivery(); err != nil {
		return err
	}
	// cursor消失は再読取開始前またはhealthcheckで残す。確認後の手動解除まで異常を維持する。
	gap, err := os.ReadFile("/var/lib/vector/journal-gap.json")
	if err == nil {
		var interval struct{ From, To string }
		if len(gap) > 1024 || json.Unmarshal(gap, &interval) != nil {
			return fmt.Errorf("journal_gap_state_invalid")
		}
		if _, err := time.Parse(time.RFC3339Nano, interval.From); err != nil {
			interval.From = "unknown"
		}
		if _, err := time.Parse(time.RFC3339Nano, interval.To); err != nil {
			interval.To = "unknown"
		}
		o.changed("delivery:gap", map[string]any{"event": "logging_loss_unknown", "reason": "journal_cursor_missing", "from": interval.From, "to": interval.To, "loss_count": nil})
		return fmt.Errorf("journal_cursor_missing")
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("journal_gap_state_unreadable")
	}
	if values["discarded_events"] > prior.Discarded {
		return fmt.Errorf("delivery_discarded")
	}
	if values["errors"] > 0 && values["buffer_events"] > 0 && values["sent_events"] <= prior.Sent {
		return fmt.Errorf("delivery_retrying")
	}
	return nil
}

// saveDeliveryは最終観測を同じボリューム内で原子的に更新する。書込不能も監視異常とする。
func (o *observer) saveDelivery() error {
	path := "/var/lib/log-observer/delivery.json"
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("delivery_state_unwritable")
	}
	data, err := json.Marshal(o.deliveryState)
	if err != nil {
		return fmt.Errorf("delivery_state_invalid")
	}
	if err = os.WriteFile(path+".tmp", data, 0600); err != nil {
		return fmt.Errorf("delivery_state_unwritable")
	}
	if err = os.Rename(path+".tmp", path); err != nil {
		return fmt.Errorf("delivery_state_unwritable")
	}
	return nil
}
