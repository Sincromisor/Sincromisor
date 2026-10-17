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

// 人工の7送信・4受理を確認する試験であり、実環境の切断事象の再現ではない。
func TestInterruptionCountsPartialResultsAndSeparatesGenerations(t *testing.T) {
	var logs bytes.Buffer
	factory := &fakeFactory{t: t}
	c, err := newCoordinatorWithHooks(factory, slog.New(slog.NewJSONHandler(&logs, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil }, nonExpiringOutputWait)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Start(context.Background(), "interruption-session", "sincro"); err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	c.mu.Lock()
	oldWork := c.work
	c.mu.Unlock()
	set := factory.setAt(t, 0)
	sent := make(chan bool, 7)
	count := 0
	send := set.synth.onResult
	set.synth.onResult = func(value protocol.ProcessorResult) {
		count++
		if count <= 4 {
			send(value)
		}
		sent <- true
	}
	set.processor.onRequest = func(request protocol.ProcessorRequest) {
		message := protocol.ChatMessage{SpeechID: request.RequestMessage.SpeechID, Message: "secret-body"}
		voiceText := "secret-voice-text"
		for range 7 {
			set.processor.results <- protocol.ProcessorResult{
				SessionID: request.SessionID, SequenceID: request.SequenceID, Confirmed: request.Confirmed,
				History: request.History, RequestMessage: request.RequestMessage,
				ResponseMessage: message, VoiceText: &voiceText,
			}
		}
	}
	if err := c.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatal(err)
	}
	for range 7 {
		receive(t, sent)
	}
	waitFor(t, func() bool { return len(c.synthOut) == 4 && len(c.textOut) == 8 })
	c.requestReset(1, pclient.ServiceSynthesizer, "remote_close")
	waitFor(t, func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		return c.state == StateRunning && c.generation == 2
	})
	// 遅着は本番と同じ受理境界で拒否し、旧世代の受理数にも足さない。
	if c.acceptSynthesisResult(oldWork) {
		t.Fatal("accepted late result")
	}
	if err := c.publishSynth(1, protocol.SynthesizerResult{SpeechID: 1}); err != nil {
		t.Fatal(err)
	}
	if len(c.synthOut) != 0 {
		t.Fatal("late result published")
	}
	c.requestReset(2, pclient.ServiceSynthesizer, "remote_close")
	waitFor(t, func() bool { return factory.count() == 3 })
	if err := c.Close(); err != nil {
		t.Fatal(err)
	}
	events := interruptionLogs(t, logs.String())
	if len(events) != 2 {
		t.Fatalf("events = %#v", events)
	}
	for key, want := range map[string]float64{
		"generation": 1, "synthesis_sent": 7, "synthesis_received": 4,
		"synthesis_unreceived": 3, "discarded_text": 8, "discarded_audio": 4,
	} {
		if events[0][key] != want {
			t.Fatalf("%s = %v, want %v", key, events[0][key], want)
		}
	}
	for _, key := range []string{"synthesis_sent", "synthesis_received", "synthesis_unreceived", "discarded_text", "discarded_audio"} {
		if events[1][key] != float64(0) {
			t.Fatalf("next generation %s = %v", key, events[1][key])
		}
	}
	if events[0]["session_id"] != "interruption-session" || events[1]["generation"] != float64(2) {
		t.Fatal(events)
	}
	if !strings.Contains(logs.String(), "stale_generation") {
		t.Fatal("missing late drop")
	}
	assertLogDoesNotContain(t, logs.String(), "secret-body", "secret-voice-text", "encoded-voice")
}

func TestInterruptionDoesNotCountFailedSend(t *testing.T) {
	var logs bytes.Buffer
	factory := &fakeFactory{t: t}
	c := newTestCoordinator(t, factory)
	c.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	if err := c.Start(context.Background(), "failed-send", "sincro"); err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	factory.setAt(t, 0).synth.sendError = errors.New("secret-write")
	if err := c.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return factory.count() == 2 })
	if err := c.Close(); err != nil {
		t.Fatal(err)
	}
	events := interruptionLogs(t, logs.String())
	if len(events) != 1 || events[0]["synthesis_sent"] != float64(0) || events[0]["synthesis_unreceived"] != float64(0) {
		t.Fatal(events)
	}
}

func interruptionLogs(t *testing.T, text string) []map[string]any {
	t.Helper()
	var events []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(text), "\n") {
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		if event["msg"] == "pipeline_interrupted" {
			events = append(events, event)
		}
	}
	return events
}
