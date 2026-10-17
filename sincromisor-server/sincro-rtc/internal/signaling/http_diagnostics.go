package signaling

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"net/url"
	"slices"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"
)

const diagnosticsPath = apiPrefix + "diagnostics"
const maxDiagnosticBytes = 16 << 10

// browserDiagnosticは任意本文・contextを持たない端末申告であり、所有権の証明には使わない。
type browserDiagnostic struct {
	Event      string          `json:"event"`
	Reason     string          `json:"reason"`
	ClientTime string          `json:"client_time"`
	SessionID  string          `json:"session_id,omitempty"`
	Count      int             `json:"count"`
	Operation  json.RawMessage `json:"operation,omitempty"`
	HTTPStatus json.RawMessage `json:"http_status,omitempty"`
	IceSummary json.RawMessage `json:"ice_summary,omitempty"`
}
type browserDiagnostics struct {
	ClientID string              `json:"client_id"`
	Dropped  *int                `json:"dropped"`
	Failures *int                `json:"failures"`
	Events   []browserDiagnostic `json:"events"`
}

// diagnosticRateはIPを保存せず、プロセス全体の受付量を有限にする固定窓である。
// 診断だけを制限し、既存signalingの受付へ影響させない。
type diagnosticRate struct {
	mu    sync.Mutex
	start time.Time
	count int
}

func (r *diagnosticRate) allow(now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if now.Sub(r.start) >= time.Minute {
		r.start = now
		r.count = 0
	}
	if r.count >= 60 {
		return false
	}
	r.count++
	return true
}

// handleDiagnosticsは同一オリジン・有限JSON・固定語彙を全件検証してから記録する。
// 拒否した要求の本文やJSON解析エラーの値は運用ログへ出さない。
func (s *Server) handleDiagnostics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, 405, "Method not allowed.")
		return
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	origin, err := url.Parse(r.Header.Get("Origin"))
	if err != nil || origin.Host != r.Host || origin.Scheme != scheme || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" || (r.Header.Get("Sec-Fetch-Site") != "" && r.Header.Get("Sec-Fetch-Site") != "same-origin") {
		writeError(w, 403, "Same origin required.")
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(w, 415, "JSON required.")
		return
	}
	if !s.diagnosticRate.allow(time.Now()) {
		w.Header().Set("Retry-After", "60")
		writeError(w, 429, "Diagnostic rate exceeded.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxDiagnosticBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var batch browserDiagnostics
	if err := decoder.Decode(&batch); err != nil {
		diagnosticDecodeError(w, err)
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		diagnosticDecodeError(w, err)
		return
	}
	if !validUUID(batch.ClientID) || len(batch.Events) == 0 || len(batch.Events) > 8 || batch.Dropped == nil || batch.Failures == nil || *batch.Dropped < 0 || *batch.Dropped > 1000000 || *batch.Failures < 0 || *batch.Failures > 1000000 {
		writeError(w, 400, "Invalid diagnostic batch.")
		return
	}
	for _, event := range batch.Events {
		if !validDiagnostic(event) {
			writeError(w, 400, "Invalid diagnostic event.")
			return
		}
	}
	received := time.Now().UTC().Format(time.RFC3339Nano)
	for _, event := range batch.Events {
		attrs := []any{"event", "browser_diagnostic", "source", "browser", "client_id", batch.ClientID, "client_time", event.ClientTime, "received_at", received, "diagnostic_event", event.Event, "reason", event.Reason, "count", event.Count, "client_dropped", *batch.Dropped, "client_failures", *batch.Failures}
		if event.SessionID != "" {
			attrs = append(attrs, "session_id", event.SessionID)
		}
		signaling, _ := signalingDiagnosticAttrs(event)
		ice, _ := iceDiagnosticAttrs(event)
		attrs = append(attrs, signaling...)
		s.logger.Info("Browser diagnostic", append(attrs, ice...)...)
	}
	w.WriteHeader(http.StatusNoContent)
}

// diagnosticDecodeErrorは上限超過だけを413へ分け、任意の不正本文を応答へ反映しない。
func diagnosticDecodeError(w http.ResponseWriter, err error) {
	if isMaxBytesError(err) {
		writeError(w, 413, "Diagnostic body too large.")
		return
	}
	writeError(w, 400, "Invalid diagnostic JSON.")
}

// validDiagnosticの語彙はフロント契約と対で更新する。自由文は受け付けない。
func validDiagnostic(event browserDiagnostic) bool {
	if _, valid := iceDiagnosticAttrs(event); !valid {
		return false
	}
	if _, valid := signalingDiagnosticAttrs(event); !valid {
		return false
	}
	if !slices.Contains([]string{"microphone", "camera", "rtc", "rtc_telop", "rtc_text", "rtc_track", "signaling", "model", "render", "webgl", "unhandled_error", "unhandled_rejection", "vad_worker", "tracker_worker"}, event.Event) {
		return false
	}
	if !slices.Contains([]string{"unknown", "permission_denied", "not_found", "not_readable", "overconstrained", "security", "aborted", "failed", "ready", "ended", "connected", "completed", "disconnected", "closed", "lost", "restored", "idle", "loading", "running", "fallback", "unavailable"}, event.Reason) {
		return false
	}
	if len(event.ClientTime) > 35 || event.Count < 1 || event.Count > 1000000 {
		return false
	}
	if event.SessionID != "" {
		if _, err := ulid.ParseStrict(event.SessionID); err != nil {
			return false
		}
	}
	parsed, err := time.Parse(time.RFC3339Nano, event.ClientTime)
	return err == nil && parsed.Year() >= 2000 && parsed.Year() <= 2100
}

// signalingDiagnosticAttrs は省略とnullを区別し、シグナリングだけの固定属性へ変換する。
// 未知項目拒否は外側のdecoderが所有し、この境界では値の型・範囲を検査する。
func signalingDiagnosticAttrs(event browserDiagnostic) ([]any, bool) {
	if (len(event.Operation) > 0 || len(event.HTTPStatus) > 0) && event.Event != "signaling" {
		return nil, false
	}
	var attrs []any
	if len(event.Operation) > 0 {
		var operation string
		if json.Unmarshal(event.Operation, &operation) != nil || !slices.Contains([]string{"initial-offer", "update-offer", "candidate"}, operation) {
			return nil, false
		}
		attrs = append(attrs, "operation", operation)
	}
	if len(event.HTTPStatus) > 0 {
		var status int
		if json.Unmarshal(event.HTTPStatus, &status) != nil || status < 100 || status > 599 {
			return nil, false
		}
		attrs = append(attrs, "http_status", status)
	}
	return attrs, true
}
