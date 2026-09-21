package main

import (
	"strings"
	"testing"
)

// sink以外の破棄・任意labelを混ぜず、欠落した指標や不正値を正常としない。
func TestDeliveryMetrics(t *testing.T) {
	raw := `vector_buffer_max_size_bytes{component_id="central"} 268435488
vector_buffer_size_bytes{component_id="central"} 1024
vector_component_sent_events_total{component_id="central"} 12
vector_component_discarded_events_total{component_id="central",intentional="true"} 3
vector_buffer_discarded_events_total{component_id="central"} 7
vector_component_discarded_events_total{component_id="host_diagnostics"} 99
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
