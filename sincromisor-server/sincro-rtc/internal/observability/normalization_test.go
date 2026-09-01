package observability

import (
	"maps"
	"net/http/httptest"
	"regexp"
	"slices"
	"strings"
	"testing"
)

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
