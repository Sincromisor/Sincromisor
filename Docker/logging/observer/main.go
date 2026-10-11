// log-observerはVectorの収集状態と配送指標を中央ログ用の有限なJSONLへ変換する。
// journalの読取はVector、配送累計はdelivery.goが所有し、Docker・Consulの状態は観測しない。
package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"sync/atomic"
	"syscall"
	"time"
)

// healthcheckは最大10秒のjournal読取を伴うため、次の10秒周期まで最大20秒空く。
// 2回連続の実行遅延と5秒のobserver周期を許しつつ、古い成功状態を失効させる45秒にする。
const collectorStateTTL = 45 * time.Second

var (
	collectorStatePath       = "/var/lib/vector/collector-health.json"
	deliveryStatePath        = "/var/lib/log-observer/delivery.json"
	journalGapPath           = "/var/lib/vector/journal-gap.json"
	observerNow              = time.Now
	errCollectorStateMissing = errors.New("collector_state_missing")
	errCollectorStateInvalid = errors.New("collector_state_invalid")
	errCollectorStateStale   = errors.New("collector_state_stale")
	errCollectorUnavailable  = errors.New("collector_unavailable")
	startIDPattern           = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

// collectorStateはVector healthcheckが原子的に書く、ログ本文を含まない収集状態である。
// start_idが変わると前回の配送累計を比較できないため、delivery.goは不明区間として再初期化する。
type collectorState struct {
	StartID   string `json:"start_id"`
	CheckedAt string `json:"checked_at"`
	Healthy   bool   `json:"healthy"`
	Reason    string `json:"reason"`
}

// observerは状態ファイルとVector metricsを読むだけで、Docker APIやConsul APIの権限を持たない。
type observer struct {
	vector         *http.Client
	emit           func(map[string]any)
	previous       map[string]string
	ready          atomic.Bool
	collectorReady atomic.Bool
	vectorStarted  string
	deliveryState  deliveryState
}

// changedは同じ状態の連続出力を抑止する。比較値はプロセス内だけに保持する。
func (o *observer) changed(key string, value map[string]any) {
	encoded, err := json.Marshal(value)
	if err != nil || o.previous[key] == string(encoded) {
		return
	}
	o.previous[key] = string(encoded)
	o.emit(value)
}

// collectorHealthは起動直後、壊れた値、期限切れ、未来時刻をすべて異常として扱う。
// HTTP公開状態は更新せず、runが配送判定まで完了してから一括で公開する。
// Vector停止・再作成後に古い成功結果を使わないため、状態ファイルのmtimeではなくchecked_atを検証する。
func (o *observer) collectorHealth(now time.Time) error {
	o.vectorStarted = ""
	data, err := os.ReadFile(collectorStatePath)
	if err != nil || len(data) > 1024 {
		return errCollectorStateMissing
	}
	var state collectorState
	if json.Unmarshal(data, &state) != nil || !startIDPattern.MatchString(state.StartID) || !validCollectorReason(state.Reason) {
		return errCollectorStateInvalid
	}
	checked, err := time.Parse(time.RFC3339, state.CheckedAt)
	if err != nil || checked.After(now) || now.Sub(checked) > collectorStateTTL {
		return errCollectorStateStale
	}
	if !state.Healthy {
		return errCollectorUnavailable
	}
	o.vectorStarted = state.StartID
	return nil
}

// validCollectorReasonはhealthcheckが書く固定語彙だけを受け入れ、共有ボリュームへ混入した任意本文を出力しない。
func validCollectorReason(reason string) bool {
	switch reason {
	case "starting", "state_invalid", "vector_unavailable", "journal_unreadable_or_missing", "journal_cursor_missing", "journal_input_unavailable", "available":
		return true
	}
	return false
}

// runは状態ファイル、配送指標、原本消失markerを同じ周期で判定する。
// HTTP生存だけで正常にせず、いずれかの異常が /collector と /health を503へ遷移させる。
func (o *observer) run(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		collectorErr := o.collectorHealth(observerNow().UTC())
		o.failure("collector_state", collectorErr)
		deliveryErr := o.delivery(ctx)
		o.failure("logging_delivery", deliveryErr)
		if deliveryErr != nil && deliveryErr.Error() == "collector_metrics_unavailable" {
			o.changed("delivery:unavailable", map[string]any{"event": "logging_loss_unknown", "reason": "collector_unavailable", "from": o.deliveryState.LastObserved, "to": observerNow().UTC().Format(time.RFC3339Nano), "loss_count": nil})
		}
		// 収集状態だけでは公開しない。配送まで通った同一周期の結果だけをHTTPとConsulへ公開する。
		ready := collectorErr == nil && deliveryErr == nil
		o.collectorReady.Store(ready)
		o.ready.Store(ready)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// failureは状態の悪化と復旧を同じキーで出力し、相手の本文やURLは保存しない。
func (o *observer) failure(source string, err error) {
	status, reason := "passing", "available"
	if err != nil {
		status, reason = "critical", err.Error()
	}
	o.changed("query:"+source, map[string]any{"event": "observer_query", "source": source, "status": status, "reason": reason})
}

// mainだけが状態ファイル、HTTPサーバー、終了シグナルの寿命を所有する。
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	encoder := json.NewEncoder(os.Stdout)
	emit := func(row map[string]any) {
		if _, ok := row["timestamp"]; !ok {
			row["timestamp"] = time.Now().UTC().Format(time.RFC3339Nano)
		}
		row["level"], row["message"] = "info", row["event"]
		if encoder.Encode(row) != nil {
			stop()
		}
	}
	o := observer{vector: &http.Client{Timeout: 5 * time.Second}, emit: emit, previous: map[string]string{}}
	// 旧形式にはDockerのStartedAtが含まれる。起動識別子がなければ累計を引き継がず不明区間として扱う。
	if data, err := os.ReadFile(deliveryStatePath); err == nil && len(data) <= 4096 {
		if json.Unmarshal(data, &o.deliveryState) != nil {
			emit(map[string]any{"event": "observer_startup_failed", "reason": "delivery_state_invalid"})
		}
	}
	server := &http.Server{Addr: ":8687", ReadHeaderTimeout: 3 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ready := o.ready.Load()
		if r.URL.Path == "/collector" {
			ready = o.collectorReady.Load()
		}
		if !ready {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		_, _ = io.WriteString(w, "observer\n")
	})}
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			stop()
		}
	}()
	o.run(ctx)
	if server.Close() != nil {
		emit(map[string]any{"event": "observer_shutdown_failed"})
	}
}
