package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestPipelineStageLogsRecordProgressWithoutPayloads(t *testing.T) {
	var logs bytes.Buffer
	factory := &fakeFactory{t: t}
	coordinator, err := newCoordinatorWithHooks(
		factory,
		slog.New(slog.NewJSONHandler(&logs, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		nonExpiringOutputWait,
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := coordinator.Start(context.Background(), "session-stage-log", "sincro"); err != nil {
		t.Fatal(err)
	}
	frame := make([]byte, pcmFrameBytes)
	copy(frame, "payload-audio-marker")
	if err := coordinator.SubmitPCM(frame); err != nil {
		t.Fatal(err)
	}
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.SynthResults())
	if err := coordinator.Close(); err != nil {
		t.Fatal(err)
	}

	stages := pipelineStageLogs(t, logs.String())
	for _, stage := range []string{
		"recognizer_result_received", "processor_request_sent",
		"processor_result_received", "synthesizer_result_received",
	} {
		entry, found := stages[stage]
		if !found {
			t.Fatalf("missing pipeline stage %q in %s", stage, logs.String())
		}
		if entry["session_id"] != "session-stage-log" || entry["confirmed"] != true {
			t.Fatalf("invalid stage correlation fields for %q: %#v", stage, entry)
		}
	}
	if stages["processor_result_received"]["end_of_response"] != true ||
		stages["processor_result_received"]["voice_text_present"] != true {
		t.Fatalf("processor result flags = %#v", stages["processor_result_received"])
	}
	for _, forbidden := range []string{"fixture recognized", "fixture response", "payload-audio-marker", "encoded-voice", "81a17801"} {
		if strings.Contains(logs.String(), forbidden) {
			t.Fatalf("pipeline stage logs exposed payload %q: %s", forbidden, logs.String())
		}
	}
}

func TestPipelineStageLogsIdentifyPartialRecognizerStop(t *testing.T) {
	var logs bytes.Buffer
	factory := &fakeFactory{t: t}
	coordinator, err := newCoordinatorWithHooks(
		factory,
		slog.New(slog.NewJSONHandler(&logs, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		nonExpiringOutputWait,
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := coordinator.Start(context.Background(), "session-partial-stage-log", "sincro"); err != nil {
		t.Fatal(err)
	}
	set := factory.setAt(t, 0)
	set.extractor.onPCM = func([]byte) {
		set.extractor.results <- protocol.ExtractorResult{
			SessionID: "session-partial-stage-log", SpeechID: 1, SequenceID: 1, Confirmed: false,
		}
	}
	coordinator.mu.Lock()
	work := coordinator.work
	coordinator.mu.Unlock()
	work.conv.mu.Lock()
	work.conv.currentUser = &protocol.ChatMessage{SpeechID: 2}
	work.conv.mu.Unlock()
	if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return factory.count() == 2 })
	if err := coordinator.Close(); err != nil {
		t.Fatal(err)
	}

	stages := pipelineStageLogs(t, logs.String())
	entry, found := stages["recognizer_result_received"]
	if !found || entry["confirmed"] != false {
		t.Fatalf("partial recognizer stage = %#v", entry)
	}
	for _, stage := range []string{"processor_request_sent", "processor_result_received", "synthesizer_result_received"} {
		if _, found := stages[stage]; found {
			t.Fatalf("partial recognizer unexpectedly reached %q: %s", stage, logs.String())
		}
	}
}

func TestPipelineResetLogsRecordAcceptedOriginWithoutPayloads(t *testing.T) {
	t.Run("remote close", func(t *testing.T) {
		var logs bytes.Buffer
		factory := &fakeFactory{t: t}
		coordinator, err := newCoordinatorWithHooks(
			factory, slog.New(slog.NewJSONHandler(&logs, nil)),
			func(time.Duration) (time.Duration, error) { return 0, nil }, nonExpiringOutputWait,
		)
		if err != nil {
			t.Fatal(err)
		}
		if err := coordinator.Start(context.Background(), "session-reset-log", "sincro"); err != nil {
			t.Fatal(err)
		}
		frame := make([]byte, pcmFrameBytes)
		copy(frame, "audio-payload-marker")
		if err := coordinator.SubmitPCM(frame); err != nil {
			t.Fatal(err)
		}
		_ = receive(t, coordinator.TextResults())
		_ = receive(t, coordinator.TextResults())
		_ = receive(t, coordinator.SynthResults())
		factory.setAt(t, 0).emit(pclient.Event{
			Service: pclient.ServiceRecognizer, Kind: pclient.EventRemoteClose,
			Err: errors.New("error-body-marker"),
		})
		waitFor(t, func() bool { return factory.count() == 2 })
		if err := coordinator.Close(); err != nil {
			t.Fatal(err)
		}

		assertResetLogs(t, logs.String(), []map[string]any{{
			"session_id": "session-reset-log", "service": string(pclient.ServiceRecognizer),
			"cause": string(pclient.EventRemoteClose), "generation": float64(1),
		}})
		assertLogDoesNotContain(t, logs.String(), "error-body-marker", "fixture recognized", "fixture response", "audio-payload-marker", "encoded-voice")
	})

	t.Run("runtime error", func(t *testing.T) {
		var logs bytes.Buffer
		factory := &fakeFactory{t: t}
		coordinator, err := newCoordinatorWithHooks(
			factory, slog.New(slog.NewJSONHandler(&logs, nil)),
			func(time.Duration) (time.Duration, error) { return 0, nil }, nonExpiringOutputWait,
		)
		if err != nil {
			t.Fatal(err)
		}
		if err := coordinator.Start(context.Background(), "session-runtime-reset", "sincro"); err != nil {
			t.Fatal(err)
		}
		coordinator.requestReset(1, pclient.ServiceProcessor, resetCauseRuntimeError)
		waitFor(t, func() bool { return factory.count() == 2 })
		if err := coordinator.Close(); err != nil {
			t.Fatal(err)
		}
		assertResetLogs(t, logs.String(), []map[string]any{{
			"session_id": "session-runtime-reset", "service": string(pclient.ServiceProcessor),
			"cause": resetCauseRuntimeError, "generation": float64(1),
		}})
	})

	t.Run("stale reset is not logged", func(t *testing.T) {
		var logs bytes.Buffer
		coordinator, err := newCoordinatorWithHooks(
			&fakeFactory{t: t}, slog.New(slog.NewJSONHandler(&logs, nil)),
			func(time.Duration) (time.Duration, error) { return 0, nil }, nonExpiringOutputWait,
		)
		if err != nil {
			t.Fatal(err)
		}
		if err := coordinator.Start(context.Background(), "session-stale-reset", "sincro"); err != nil {
			t.Fatal(err)
		}
		coordinator.requestReset(1, "", resetCauseRuntimeError)
		coordinator.requestReset(0, pclient.ServiceProcessor, resetCauseRuntimeError)
		if err := coordinator.Close(); err != nil {
			t.Fatal(err)
		}
		assertResetLogs(t, logs.String(), nil)
	})
}

func assertResetLogs(t *testing.T, values string, want []map[string]any) {
	t.Helper()
	var got []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(values), "\n") {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("decode log entry: %v", err)
		}
		if entry["msg"] == "pipeline_reset_requested" {
			got = append(got, entry)
		}
	}
	if len(got) != len(want) {
		t.Fatalf("reset logs = %#v, want %#v", got, want)
	}
	for index, expected := range want {
		for key := range got[index] {
			switch key {
			case "time", "level", "msg", "stage", "session_id", "service", "cause", "generation":
			default:
				t.Fatalf("unexpected reset log field %q: %#v", key, got[index])
			}
		}
		if got[index]["stage"] != "pipeline_reset_requested" {
			t.Fatalf("reset log stage = %#v", got[index])
		}
		for key, value := range expected {
			if got[index][key] != value {
				t.Fatalf("reset log %s = %#v, want %#v", key, got[index][key], value)
			}
		}
	}
}

func assertLogDoesNotContain(t *testing.T, values string, forbidden ...string) {
	t.Helper()
	for _, value := range forbidden {
		if strings.Contains(values, value) {
			t.Fatalf("log exposed %q: %s", value, values)
		}
	}
}

func pipelineStageLogs(t *testing.T, values string) map[string]map[string]any {
	t.Helper()
	stages := make(map[string]map[string]any)
	for _, line := range strings.Split(strings.TrimSpace(values), "\n") {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("decode log entry: %v", err)
		}
		stage, _ := entry["stage"].(string)
		if strings.HasSuffix(stage, "_received") || stage == "processor_request_sent" {
			stages[stage] = entry
		}
	}
	return stages
}
