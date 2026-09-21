package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// 固定OOMと実API代役で、状態の関連付け・本文の非出力・失敗理由の変化を確認する。
func TestObservation(t *testing.T) {
	rows := []map[string]any{}
	o := observer{project: "fixture", previous: map[string]string{}, inputs: map[string][32]byte{}, seen: map[string]bool{}, emit: func(row map[string]any) { rows = append(rows, row) }}
	var event dockerEvent
	if err := json.Unmarshal([]byte(`{"Action":"oom","timeNano":1770000000000000000,"Actor":{"ID":"target","Attributes":{"com.docker.compose.project":"fixture","com.docker.compose.service":"worker","secret":"private-token"}}}`), &event); err != nil {
		t.Fatal(err)
	}
	o.event(event)
	if len(rows) != 1 || rows[0]["target_container_id"] != "target" || rows[0]["action"] != "oom" {
		t.Fatal(rows)
	}
	event.Actor.Attributes[projectLabel] = "other"
	o.event(event)
	if len(rows) != 1 {
		t.Fatal("別プロジェクトを収集した")
	}
	c := container{ID: "target"}
	c.Config.Labels = map[string]string{serviceLabel: "worker"}
	c.State.Health = &health{Status: "unhealthy", Log: []checkLog{{Start: "one", End: "two", ExitCode: 1, Output: "HTTP 503 https://user:private-token@host/?text=人工本文 Authorization: Bearer private-token"}}}
	o.health(c)
	o.health(c)
	if len(rows) != 2 || rows[1]["diagnostic"] != "http_status=503" {
		t.Fatal(rows)
	}
	c.State.Health.Log[0].Output = "connection refused " + strings.Repeat("private-token", 500)
	o.health(c)
	if len(rows) != 3 || rows[2]["diagnostic_truncated"] != true {
		t.Fatal(rows)
	}
	c.State.Health.Log = nil
	o.health(c)
	if rows[3]["history_missing"] != true {
		t.Fatal(rows)
	}
	failed := false
	output := "HTTP 403 private-token 人工本文"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failed {
			w.WriteHeader(503)
			return
		}
		if err := json.NewEncoder(w).Encode([]consulCheck{{Node: "actual-node", CheckID: "actual-check", ServiceID: "instance", ServiceName: "worker", Status: "critical", Output: output}}); err != nil {
			t.Error(err)
		}
	}))
	defer server.Close()
	o.consul = server.Client()
	o.consulURL = server.URL
	if err := o.consulChecks(context.Background()); err != nil {
		t.Fatal(err)
	}
	count := len(rows)
	if err := o.consulChecks(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(rows) != count {
		t.Fatal("同一Consul状態を重複した")
	}
	output = "connection refused private-token"
	if err := o.consulChecks(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(rows) != count+1 || rows[len(rows)-1]["target_node"] != "actual-node" {
		t.Fatal(rows)
	}
	failed = true
	err := o.consulChecks(context.Background())
	if err == nil {
		t.Fatal("取得失敗を見落とした")
	}
	o.failure("consul_checks", err)
	if rows[len(rows)-1]["status"] != "critical" {
		t.Fatal(rows)
	}
	encoded, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"private-token", "人工本文", "Authorization", "https://"} {
		if strings.Contains(string(encoded), secret) {
			t.Fatalf("秘密が残った: %s", secret)
		}
	}
}

// inspect不能は履歴なしと区別し、補助収集の死活判定も失敗にする。
func TestInspectFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/containers/json" {
			_, _ = w.Write([]byte(`[{"Id":"target","Labels":{"com.docker.compose.project":"fixture","com.docker.compose.service":"worker"}}]`))
			return
		}
		w.WriteHeader(403)
	}))
	defer server.Close()
	proxy, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	rows := []map[string]any{}
	o := observer{project: "fixture", docker: &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxy)}}, previous: map[string]string{}, seen: map[string]bool{}, emit: func(row map[string]any) { rows = append(rows, row) }}
	if err := o.dockerHealth(context.Background()); err == nil {
		t.Fatal("inspect失敗を正常とした")
	}
	if len(rows) != 1 || rows[0]["event"] != "docker_health_query_failed" || rows[0]["reason"] != "http_status=403" {
		t.Fatal(rows)
	}
	diagnostic, _ := diagnosis("HTTP GET http://host/private?text=private-token: 503 Service Unavailable Output: private-token")
	if diagnostic != "http_status=503" {
		t.Fatal(diagnostic)
	}
}

// catalogと状態が同じまま理由だけ変わっても、ローカルagentの新しい値を優先する。
func TestLocalConsulOutput(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		value := consulCheck{Node: "local-node", CheckID: "service:fixture", ServiceID: "fixture", Status: "critical", Output: "HTTP 403"}
		var body any = []consulCheck{value}
		if r.URL.Path == "/v1/agent/checks" {
			value.Output = "HTTP 503 private-token"
			body = map[string]consulCheck{"service:fixture": value}
		}
		if err := json.NewEncoder(w).Encode(body); err != nil {
			t.Error(err)
		}
	}))
	defer server.Close()
	proxy, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	rows := []map[string]any{}
	o := observer{consul: &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxy)}}, consulURL: "http://catalog", localAgents: map[string]bool{"consul-agent-fixture": true}, previous: map[string]string{}, inputs: map[string][32]byte{}, seen: map[string]bool{}, emit: func(row map[string]any) { rows = append(rows, row) }}
	if err := o.consulChecks(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[1]["diagnostic"] != "http_status=503" {
		t.Fatal(rows)
	}
}
