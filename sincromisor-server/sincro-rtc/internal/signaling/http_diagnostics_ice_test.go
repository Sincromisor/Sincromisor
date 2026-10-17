package signaling

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// 既存の失敗統計収集からTypeScriptが実送信したJSONと同じfixtureを受け付ける。
func TestBrowserIceDiagnosticFixture(t *testing.T) {
	data, err := os.ReadFile("testdata/browser-ice-diagnostics.json")
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
	var row map[string]any
	if err := json.Unmarshal(output.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	summary, ok := row["ice_summary"].(map[string]any)
	if !ok || len(summary) != 8 || summary["rtt_ms"] != float64(25) || summary["pair_count"] != float64(2) || summary["succeeded_pair_count"] != float64(1) || summary["remote_type"] != "relay" {
		t.Fatal(row)
	}
	if row["session_id"] != "01K1AF2Y0H0000000000000001" || row["diagnostic_event"] != "rtc" {
		t.Fatal(row)
	}
}

func TestBrowserIceDiagnosticBoundaries(t *testing.T) {
	for _, tc := range []struct {
		summary string
		valid   bool
	}{
		{`{}`, true}, {`{"pair_count":0,"rtt_ms":0}`, true},
		{`{"pair_count":1000000}`, true},
		{`null`, false}, {`[]`, false}, {`{"pair_count":null}`, false},
		{`{"pair_count":-1}`, false}, {`{"succeeded_pair_count":1000001}`, false},
		{`{"pair_count":1.5}`, false}, {`{"rtt_ms":-1}`, false}, {`{"rtt_ms":1e999}`, false},
		{`{"rtt_ms":"NaN"}`, false}, {`{"rtt_ms":null}`, false},
		{`{"signaling_state":"private-token"}`, false}, {`{"gathering_state":"unknown"}`, false},
		{`{"pair_state":"connected"}`, false}, {`{"local_type":"ip"}`, false},
		{`{"remote_type":"private-token"}`, false}, {`{"address":"private-token"}`, false},
	} {
		for _, event := range []string{"rtc", "signaling"} {
			var output bytes.Buffer
			s := Server{logger: slog.New(slog.NewJSONHandler(&output, nil))}
			body := strings.Replace(diagnosticFixture, "microphone", event, 1)
			body = strings.Replace(body, `"count":1`, `"count":1,"ice_summary":`+tc.summary, 1)
			req := httptest.NewRequest("POST", "http://example.com"+diagnosticsPath, strings.NewReader(body))
			req.Header.Set("Origin", "http://example.com")
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			s.handleDiagnostics(res, req)
			want := 400
			if event == "rtc" && tc.valid {
				want = 204
			}
			if res.Code != want {
				t.Fatalf("%s %s: %d", event, tc.summary, res.Code)
			}
			if want == 400 && output.Len() != 0 {
				t.Fatal("rejected fields logged")
			}
		}
	}
}
