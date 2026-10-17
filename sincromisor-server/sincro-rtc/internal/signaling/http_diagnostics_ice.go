package signaling

import (
	"bytes"
	"encoding/json"
	"math"
	"slices"
)

// iceDiagnosticAttrs はrtcの要約だけを固定の型・語彙へ変換する。
// 欠損は補わず、null・未知キー・アドレス等は拒否し、raw JSONをログへ渡さない。
func iceDiagnosticAttrs(event browserDiagnostic) ([]any, bool) {
	if len(event.IceSummary) == 0 {
		return nil, true
	}
	if event.Event != "rtc" {
		return nil, false
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(event.IceSummary, &fields) != nil || fields == nil {
		return nil, false
	}
	summary := make(map[string]any, len(fields))
	for key, raw := range fields {
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return nil, false
		}
		var choices []string
		switch key {
		case "signaling_state":
			choices = []string{"stable", "closed", "have-local-offer", "have-local-pranswer", "have-remote-offer", "have-remote-pranswer"}
		case "gathering_state":
			choices = []string{"new", "gathering", "complete"}
		case "pair_state":
			choices = []string{"frozen", "waiting", "in-progress", "failed", "succeeded"}
		case "local_type", "remote_type":
			choices = []string{"host", "srflx", "prflx", "relay"}
		case "pair_count", "succeeded_pair_count":
			var count int
			if json.Unmarshal(raw, &count) != nil || count < 0 || count > 1000000 {
				return nil, false
			}
			summary[key] = count
			continue
		case "rtt_ms":
			var rtt float64
			if json.Unmarshal(raw, &rtt) != nil || rtt < 0 || math.IsNaN(rtt) || math.IsInf(rtt, 0) {
				return nil, false
			}
			summary[key] = rtt
			continue
		default:
			return nil, false
		}
		var value string
		if json.Unmarshal(raw, &value) != nil || !slices.Contains(choices, value) {
			return nil, false
		}
		summary[key] = value
	}
	return []any{"ice_summary", summary}, true
}
