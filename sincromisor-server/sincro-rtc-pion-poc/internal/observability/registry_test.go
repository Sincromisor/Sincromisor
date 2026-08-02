package observability

import (
	"io"
	"maps"
	"net/http/httptest"
	"regexp"
	"slices"
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

func TestRegistryDeadlineStagesMatchFixedSchema(t *testing.T) {
	want := []string{
		"close",
		"disconnect_grace",
		"gather",
		"media_readiness",
		"pre_connect",
		"restart",
	}
	if !maps.Equal(deadlineStages, set(want...)) {
		t.Fatalf("deadlineStages = %v, want exact set %v", deadlineStages, want)
	}

	registry := NewRegistry()
	for _, stage := range want {
		registry.Deadline(stage)
	}
	request := httptest.NewRequest("GET", "/metrics", nil)
	response := httptest.NewRecorder()
	registry.Handler().ServeHTTP(response, request)
	matches := regexp.MustCompile(`sincro_rtc_deadlines_total\{stage="([^"]+)"\} 1`).FindAllStringSubmatch(
		response.Body.String(),
		-1,
	)
	got := make([]string, 0, len(matches))
	for _, match := range matches {
		got = append(got, match[1])
	}
	slices.Sort(got)
	if !slices.Equal(got, want) {
		t.Fatalf("deadline metric stages = %v, want exact set %v", got, want)
	}
}

func TestPipelineReconnectMapsProductionServicesToFixedLabels(t *testing.T) {
	tests := []struct {
		service string
		want    string
	}{
		{service: "SpeechExtractor", want: "extractor"},
		{service: "SpeechRecognizer", want: "recognizer"},
		{service: "TextProcessor", want: "processor"},
		{service: "VoiceSynthesizer", want: "synthesizer"},
		{service: "unknown-production-service", want: "extractor"},
	}
	for _, test := range tests {
		t.Run(test.service, func(t *testing.T) {
			registry := NewRegistry()
			registry.PipelineReconnect(test.service, "start")
			request := httptest.NewRequest("GET", "/metrics", nil)
			response := httptest.NewRecorder()
			registry.Handler().ServeHTTP(response, request)
			want := `sincro_rtc_pipeline_reconnects_total{result="start",service="` + test.want + `"} 1`
			if !strings.Contains(response.Body.String(), want) {
				t.Fatalf("metric does not contain %q:\n%s", want, response.Body.String())
			}
		})
	}
}
