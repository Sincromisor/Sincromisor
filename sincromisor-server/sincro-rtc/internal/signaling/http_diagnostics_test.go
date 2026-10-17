package signaling

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

const diagnosticFixture = `{"client_id":"ab36ef90-fcf8-44b9-9b15-a1e198ca50fd","dropped":0,"failures":0,"events":[{"event":"microphone","reason":"permission_denied","client_time":"2026-09-22T00:00:00Z","count":1}]}`

// 診断受付の型・件数・サイズ・同一オリジン境界を検証し、拒否本文がログへ出ないことを確認する。
func TestBrowserDiagnostics(t *testing.T) {
	for _, tc := range []struct {
		name, body, origin string
		status             int
	}{
		{"before_session", diagnosticFixture, "http://example.com", 204},
		{"after_session", strings.Replace(diagnosticFixture, `"count":1`, `"count":1,"session_id":"01K1AF2Y0H0000000000000001"`, 1), "http://example.com", 204},
		{"foreign_origin", diagnosticFixture, "http://other.test", 403},
		{"wrong_scheme", diagnosticFixture, "https://example.com", 403},
		{"missing_origin", diagnosticFixture, "", 403},
		{"forged_host", strings.Replace(diagnosticFixture, `"count":1`, `"count":1,"host":"private-token"`, 1), "http://example.com", 400},
		{"body_reason", strings.Replace(diagnosticFixture, "permission_denied", "private-token", 1), "http://example.com", 400},
		{"invalid_time", strings.Replace(diagnosticFixture, "2026-09-22T00:00:00Z", "private-token", 1), "http://example.com", 400},
		{"null_counter", strings.Replace(diagnosticFixture, `"dropped":0`, `"dropped":null`, 1), "http://example.com", 400},
		{"large", strings.Replace(diagnosticFixture, "permission_denied", strings.Repeat("x", maxDiagnosticBytes), 1), "http://example.com", 413},
		{"trailing", diagnosticFixture + `{}`, "http://example.com", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			s := Server{logger: slog.New(slog.NewJSONHandler(&output, nil))}
			req := httptest.NewRequest("POST", "http://example.com"+diagnosticsPath, strings.NewReader(tc.body))
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			s.handleDiagnostics(response, req)
			if response.Code != tc.status {
				t.Fatalf("status %d: %s", response.Code, response.Body.String())
			}
			if tc.status == 204 {
				var row map[string]any
				if err := json.Unmarshal(output.Bytes(), &row); err != nil {
					t.Fatal(err)
				}
				if row["source"] != "browser" || row["host"] != nil || row["received_at"] == nil {
					t.Fatal(row)
				}
			} else if output.Len() != 0 {
				t.Fatal("拒否した本文を出力した")
			}
			if strings.Contains(output.String(), "private-token") {
				t.Fatal("本文が残った")
			}
		})
	}
}

// 件数超過と頻度超過は、既存会話のAPIとは別の有限な制限で拒否する。
func TestBrowserDiagnosticLimits(t *testing.T) {
	var output bytes.Buffer
	s := Server{logger: slog.New(slog.NewJSONHandler(&output, nil))}
	send := func(body string) int {
		req := httptest.NewRequest("POST", "http://example.com"+diagnosticsPath, strings.NewReader(body))
		req.Header.Set("Origin", "http://example.com")
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		s.handleDiagnostics(res, req)
		return res.Code
	}
	var batch map[string]any
	if err := json.Unmarshal([]byte(diagnosticFixture), &batch); err != nil {
		t.Fatal(err)
	}
	entry := batch["events"].([]any)[0]
	batch["events"] = []any{entry, entry, entry, entry, entry, entry, entry, entry, entry}
	encoded, err := json.Marshal(batch)
	if err != nil {
		t.Fatal(err)
	}
	if send(string(encoded)) != 400 {
		t.Fatal("件数上限を超過した")
	}
	for i := 1; i < 60; i++ {
		if status := send(diagnosticFixture); status != 204 {
			t.Fatal(fmt.Sprint(i, status))
		}
	}
	if send(diagnosticFixture) != 429 {
		t.Fatal("頻度上限を超過した")
	}
}

// TypeScriptの実送信処理と同じfixtureを受理し、選別した値がJSONへ残ることを確認する。
func TestBrowserSignalingDiagnosticFixture(t *testing.T) {
	data, err := os.ReadFile("testdata/browser-signaling-diagnostics.json")
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	s := Server{logger: slog.New(slog.NewJSONHandler(&output, nil))}
	req := httptest.NewRequest("POST", "http://example.com"+diagnosticsPath, bytes.NewReader(data))
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	s.handleDiagnostics(res, req)
	if res.Code != 204 {
		t.Fatal(res.Code, res.Body.String())
	}
	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 6 {
		t.Fatal(output.String())
	}
	for i, line := range lines {
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		if event["diagnostic_event"] != "signaling" || event["session_id"] != "01K1AF2Y0H0000000000000001" {
			t.Fatal(event)
		}
		expected := []string{"update-offer", "candidate", "candidate", "initial-offer", "initial-offer", "initial-offer"}[i]
		if event["operation"] != expected {
			t.Fatal(event)
		}
		status := []int{404, 404, 410, 429, 503, 0}[i]
		if status == 0 {
			if _, exists := event["http_status"]; exists {
				t.Fatal(event)
			}
		} else if event["http_status"] != float64(status) {
			t.Fatal(event)
		}
	}
}

func TestBrowserSignalingDiagnosticRejectsInvalidFields(t *testing.T) {
	for _, addition := range []string{
		`"operation":"private-token"`, `"operation":null`, `"operation":1`,
		`"http_status":99`, `"http_status":600`, `"http_status":503.5`, `"http_status":null`, `"http_status":"503"`,
		`"url":"private-token"`,
	} {
		for _, event := range []string{"signaling", "rtc"} {
			var output bytes.Buffer
			s := Server{logger: slog.New(slog.NewJSONHandler(&output, nil))}
			body := strings.Replace(diagnosticFixture, "microphone", event, 1)
			body = strings.Replace(body, `"count":1`, `"count":1,`+addition, 1)
			req := httptest.NewRequest("POST", "http://example.com"+diagnosticsPath, strings.NewReader(body))
			req.Header.Set("Origin", "http://example.com")
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			s.handleDiagnostics(res, req)
			if res.Code != 400 || output.Len() != 0 {
				t.Fatalf("%s %s: %d %s", event, addition, res.Code, output.String())
			}
		}
	}
	for _, addition := range []string{`"operation":"candidate"`, `"http_status":503`} {
		var event browserDiagnostic
		if err := json.Unmarshal([]byte(`{"event":"rtc",`+addition+`}`), &event); err != nil {
			t.Fatal(err)
		}
		if _, valid := signalingDiagnosticAttrs(event); valid {
			t.Fatal("other event accepted signaling fields")
		}
	}
}
