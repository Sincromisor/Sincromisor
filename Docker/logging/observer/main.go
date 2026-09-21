// log-observerはDockerとConsulの有限な状態履歴を、安全なJSONLへ変換する。
// 本体の起動条件にはせず、API障害も自身の診断としてVectorへ渡す。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

const projectLabel = "com.docker.compose.project"
const serviceLabel = "com.docker.compose.service"
const diagnosticLimit = 2048

// checkLogはコマンドや環境を復号せず、必要な実行結果だけを受け取る。
type checkLog struct {
	Start, End string
	ExitCode   int
	Output     string
}
type health struct {
	Status string
	Log    []checkLog
}
type container struct {
	ID     string
	Config struct{ Labels map[string]string }
	State  struct{ Health *health }
}
type dockerEvent struct {
	Action   string
	TimeNano int64 `json:"timeNano"`
	Actor    struct {
		ID         string
		Attributes map[string]string
	}
}

// observerの比較状態はプロセス内だけに保持する。再起動時は初回として出力する。
type observer struct {
	docker, consul     *http.Client
	consulURL, project string
	emit               func(map[string]any)
	previous           map[string]string
	localAgents        map[string]bool
	inputs             map[string][32]byte
	seen               map[string]bool
	ready              atomic.Bool
}

var httpStatus = regexp.MustCompile(`(?i)(?:HTTP/[0-9.]+\s+|HTTP\s+|status(?: code)?[=: ]+|:\s+)([1-5][0-9]{2})\b`)

// diagnosisは任意の本文を再出力せず、既知の原因だけを有限な文字列へ分類する。
// URL・ヘッダー・応答本文・コマンドに秘密が混在しても原文を代替属性へ保存しない。
func diagnosis(output string) (string, bool) {
	truncated := len(output) > diagnosticLimit
	if truncated {
		output = output[:diagnosticLimit]
	}
	lower := strings.ToLower(output)
	parts := []string{}
	if match := httpStatus.FindStringSubmatch(output); match != nil {
		parts = append(parts, "http_status="+match[1])
	}
	for _, item := range []struct{ needle, code string }{
		{"connection refused", "connection_refused"}, {"connection_refused", "connection_refused"},
		{"timed out", "timeout"}, {"timeout", "timeout"}, {"no such host", "dns_failed"},
		{"permission denied", "permission_denied"}, {"no space left", "disk_full"},
		{"connection_failed", "connection_failed"}, {"connection reset", "connection_reset"},
	} {
		if strings.Contains(lower, item.needle) && !strings.Contains(strings.Join(parts, " "), item.code) {
			parts = append(parts, item.code)
		}
	}
	if len(parts) == 0 {
		if output == "" {
			return "empty_output", truncated
		}
		return "output_redacted", truncated
	}
	return strings.Join(parts, " "), truncated
}

// getは有限サイズ・時間でJSONを取得し、失敗理由に相手の応答やURLを含めない。
func get(ctx context.Context, client *http.Client, url string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("request_invalid")
	}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("connection_failed")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("http_status=%d", res.StatusCode)
	}
	if err = json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(target); err != nil {
		return fmt.Errorf("response_invalid")
	}
	return nil
}

// changedは状態・診断の同一出力を抑止する。時刻はイベント作成後に付ける。
func (o *observer) changed(key string, value map[string]any) {
	o.seen[key] = true
	encoded, err := json.Marshal(value)
	if err != nil {
		return
	}
	if o.previous[key] == string(encoded) {
		return
	}
	o.previous[key] = string(encoded)
	o.emit(value)
}

// failureは対象の障害と取得処理の障害を分け、復旧も同じキーで通知する。
func (o *observer) failure(source string, err error) {
	status, reason := "passing", "available"
	if err != nil {
		status = "critical"
		reason = err.Error()
	}
	o.changed("query:"+source, map[string]any{"event": "observer_query", "source": source, "status": status, "reason": reason})
}

// eventsは対象プロジェクトの状態変化だけを選び、任意のActor属性を複製しない。
func (o *observer) events(ctx context.Context, since, until int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("http://docker/events?since=%d&until=%d", since, until), nil)
	if err != nil {
		return fmt.Errorf("request_invalid")
	}
	res, err := o.docker.Do(req)
	if err != nil {
		return fmt.Errorf("connection_failed")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("http_status=%d", res.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(res.Body, 8<<20))
	for {
		var e dockerEvent
		if err = decoder.Decode(&e); err == io.EOF {
			return nil
		} else if err != nil {
			return fmt.Errorf("response_invalid")
		}
		o.event(e)
	}
}

// eventは補助処理自身も実際のサービス名で記録し、業務サービスへ読み替えない。
func (o *observer) event(e dockerEvent) {
	attrs := e.Actor.Attributes
	if attrs[projectLabel] != o.project || attrs[serviceLabel] == "" {
		return
	}
	if e.Action != "start" && e.Action != "die" && e.Action != "oom" && !strings.HasPrefix(e.Action, "health_status:") {
		return
	}
	row := map[string]any{"event": "docker_lifecycle", "action": e.Action, "target_container_id": e.Actor.ID, "target_service": attrs[serviceLabel], "timestamp": time.Unix(0, e.TimeNano).UTC().Format(time.RFC3339Nano)}
	if code, err := strconv.Atoi(attrs["exitCode"]); err == nil {
		row["exit_code"] = code
	}
	o.emit(row)
}

// dockerHealthは初回異常と同一状態の新しい実行結果を取得し、履歴欠落も明示する。
func (o *observer) dockerHealth(ctx context.Context) error {
	var list []struct {
		ID     string
		Labels map[string]string
	}
	if err := get(ctx, o.docker, "http://docker/containers/json?all=1", &list); err != nil {
		return err
	}
	o.localAgents = map[string]bool{}
	var inspectErr error
	for _, item := range list {
		if item.Labels[projectLabel] != o.project {
			continue
		}
		service := item.Labels[serviceLabel]
		if strings.HasPrefix(service, "consul-agent-") || service == "sincro-consul-server" {
			o.localAgents[service] = true
		}
		var c container
		err := get(ctx, o.docker, "http://docker/containers/"+item.ID+"/json", &c)
		if err != nil {
			inspectErr = err
			o.changed("health:"+item.ID, map[string]any{"event": "docker_health_query_failed", "target_container_id": item.ID, "target_service": item.Labels[serviceLabel], "reason": err.Error()})
			continue
		}
		if c.State.Health == nil {
			if _, known := o.previous["health:"+item.ID]; known {
				o.changed("health:"+item.ID, map[string]any{"event": "docker_health", "target_container_id": item.ID, "target_service": item.Labels[serviceLabel], "history_missing": true, "status": "unavailable"})
			}
			continue
		}
		o.health(c)
	}
	return inspectErr
}

// healthは直近の実行時刻・終了値と安全な診断を関連付ける。Dockerが捨てた過去は復元しない。
func (o *observer) health(c container) {
	h := c.State.Health
	row := map[string]any{"event": "docker_health", "target_container_id": c.ID, "target_service": c.Config.Labels[serviceLabel], "status": h.Status}
	if len(h.Log) == 0 {
		row["history_missing"] = true
	} else {
		latest := h.Log[len(h.Log)-1]
		diagnostic, truncated := diagnosis(latest.Output)
		row["check_start"] = latest.Start
		row["check_end"] = latest.End
		row["exit_code"] = latest.ExitCode
		row["diagnostic"] = diagnostic
		row["diagnostic_truncated"] = truncated
	}
	o.changed("health:"+c.ID, row)
}

// runは各APIの失敗を独立して記録する。イベントの窓は成功時だけ進める。
func (o *observer) run(ctx context.Context) {
	since := time.Now().Unix()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		o.seen = map[string]bool{}
		until := time.Now().Unix()
		err := o.events(ctx, since, until)
		o.failure("docker_events", err)
		if err == nil {
			since = until
		}
		healthErr := o.dockerHealth(ctx)
		o.failure("docker_health", healthErr)
		consulErr := o.consulChecks(ctx)
		o.failure("consul_checks", consulErr)
		o.ready.Store(err == nil && healthErr == nil && consulErr == nil)
		// 削除済みコンテナやチェックの比較値を永久に保持しない。
		for key := range o.previous {
			if !o.seen[key] {
				delete(o.previous, key)
				delete(o.inputs, key)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// mainだけが設定・シグナル・ソケットとHTTPサーバーの寿命を所有する。
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	encoder := json.NewEncoder(os.Stdout)
	emit := func(row map[string]any) {
		if _, ok := row["timestamp"]; !ok {
			row["timestamp"] = time.Now().UTC().Format(time.RFC3339Nano)
		}
		row["level"] = "info"
		row["message"] = row["event"]
		if err := encoder.Encode(row); err != nil {
			stop()
		}
	}
	project := os.Getenv("SINCRO_LOG_PROJECT")
	if project == "" {
		emit(map[string]any{"event": "observer_startup_failed", "reason": "SINCRO_LOG_PROJECT"})
		return
	}
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", "/var/run/docker.sock")
	}}
	defer transport.CloseIdleConnections()
	o := observer{docker: &http.Client{Transport: transport, Timeout: 5 * time.Second}, consul: &http.Client{Timeout: 5 * time.Second}, consulURL: "http://consul-agent-logging:8500", project: project, emit: emit, previous: map[string]string{}, inputs: map[string][32]byte{}, seen: map[string]bool{}}
	server := &http.Server{Addr: ":8687", ReadHeaderTimeout: 3 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !o.ready.Load() {
			w.WriteHeader(503)
		}
		_, _ = io.WriteString(w, "observer\n")
	})}
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			stop()
		}
	}()
	o.run(ctx)
	if err := server.Close(); err != nil {
		emit(map[string]any{"event": "observer_shutdown_failed"})
	}
}
