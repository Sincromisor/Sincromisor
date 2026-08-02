package observability

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRegistryExposesFixedSchemaWithoutPayloadLabels(t *testing.T) {
	registry := NewRegistry()
	registry.SessionCreated()
	registry.SignalingRequest("payload-sdp-marker", "payload-candidate-marker", time.Millisecond)
	registry.SessionClosed("failed", "payload-chat-marker")
	registry.RTCPFeedback("payload-audio-marker")

	request := httptest.NewRequest("GET", "/metrics", nil)
	response := httptest.NewRecorder()
	registry.Handler().ServeHTTP(response, request)
	body, err := io.ReadAll(response.Result().Body)
	if err != nil {
		t.Fatal(err)
	}
	text := string(body)
	for _, name := range []string{
		"sincro_rtc_sessions_created_total",
		"sincro_rtc_sessions_active",
		"sincro_rtc_sessions_closed_total",
		"sincro_rtc_signaling_requests_total",
		"sincro_rtc_signaling_duration_seconds",
		"sincro_rtc_rtcp_feedback_total",
	} {
		if !strings.Contains(text, name) {
			t.Errorf("metrics body does not contain %s", name)
		}
	}
	for _, marker := range []string{"payload-sdp-marker", "payload-candidate-marker", "payload-chat-marker", "payload-audio-marker"} {
		if strings.Contains(text, marker) {
			t.Errorf("metrics leaked payload marker %q", marker)
		}
	}
}
