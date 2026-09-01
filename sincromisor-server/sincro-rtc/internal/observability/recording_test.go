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
	registry.SessionClosed("payload-outcome-marker", "payload-chat-marker")
	registry.ICETransition("payload-ice-from-marker", "payload-ice-to-marker")
	registry.Deadline("payload-deadline-marker")
	registry.AudioFrame("payload-direction-marker", "payload-audio-marker")
	registry.RTPDrop("payload-rtp-marker")
	registry.RTCPFeedback("payload-audio-marker")
	registry.RTCPQuality(.25, .05)
	registry.PacingLag(.02)
	registry.PacingAbort("payload-pacing-marker")
	registry.CodecError("payload-codec-marker")
	registry.PipelineReconnect("payload-service-marker", "payload-result-marker")
	registry.QueueDepthDelta("payload-queue-marker", 1)
	registry.QueueDepthDelta("payload-queue-marker", -1)
	registry.QueueOverflow("payload-overflow-queue-marker", "payload-action-marker")
	registry.DataChannelError("payload-channel-marker")
	registry.CloseDuration("payload-close-outcome-marker", time.Millisecond)

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
		"sincro_rtc_ice_transitions_total",
		"sincro_rtc_deadlines_total",
		"sincro_rtc_audio_frames_total",
		"sincro_rtc_rtp_drops_total",
		"sincro_rtc_rtcp_feedback_total",
		"sincro_rtc_rtcp_loss_ratio",
		"sincro_rtc_rtcp_rtt_seconds",
		"sincro_rtc_pacing_lag_seconds",
		"sincro_rtc_pacing_aborts_total",
		"sincro_rtc_codec_errors_total",
		"sincro_rtc_pipeline_reconnects_total",
		"sincro_rtc_queue_depth",
		"sincro_rtc_queue_overflows_total",
		"sincro_rtc_datachannel_send_errors_total",
		"sincro_rtc_session_close_duration_seconds",
	} {
		if !strings.Contains(text, name) {
			t.Errorf("metrics body does not contain %s", name)
		}
	}
	for _, marker := range []string{
		"payload-sdp-marker", "payload-candidate-marker", "payload-chat-marker", "payload-audio-marker",
		"payload-outcome-marker", "payload-ice-from-marker", "payload-ice-to-marker",
		"payload-deadline-marker", "payload-direction-marker", "payload-rtp-marker",
		"payload-pacing-marker", "payload-codec-marker", "payload-service-marker",
		"payload-result-marker", "payload-queue-marker", "payload-overflow-queue-marker",
		"payload-action-marker", "payload-channel-marker", "payload-close-outcome-marker",
	} {
		if strings.Contains(text, marker) {
			t.Errorf("metrics leaked payload marker %q", marker)
		}
	}
	if !strings.Contains(text, "sincro_rtc_sessions_active 0") ||
		!strings.Contains(text, `outcome="failed"`) {
		t.Errorf("session ownership/outcome normalization missing:\n%s", text)
	}
}
