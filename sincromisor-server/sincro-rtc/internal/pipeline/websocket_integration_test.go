package pipeline

import (
	"bytes"
	"context"
	"testing"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

type websocketFault string

const (
	faultNormal websocketFault = "normal"
	faultDecode websocketFault = "decode"
	faultRemote websocketFault = "remote"
)

// TestFixtureWebSocketPipeline は本番clientとcodecを通して4 serviceの対話を検証する。
// 各server responseはPython固定データ生成器のbytesを起点とし、processor serverは
// Coordinatorが所有するrequest identityとhistoryだけを差し替える。
func TestFixtureWebSocketPipeline(t *testing.T) {
	harness := newFixtureWebSocketHarness(t)
	defer harness.Close()
	coordinator, _ := newWebSocketCoordinator(t, harness)
	if err := coordinator.Start(context.Background(), "fixture-session", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	runWebSocketTurn(t, coordinator, 1)
	if harness.processorHistoryLength() != 1 {
		t.Fatalf("processor request history length = %d, want 1", harness.processorHistoryLength())
	}
	if harness.synthRequestCount() != 1 {
		t.Fatalf("synthesizer request count = %d, want 1", harness.synthRequestCount())
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	harness.waitActive(t, 0)
	harness.assertNoError(t)
}

func TestFixtureWebSocketResetMatrix(t *testing.T) {
	services := []pclient.Service{
		pclient.ServiceExtractor,
		pclient.ServiceRecognizer,
		pclient.ServiceProcessor,
		pclient.ServiceSynthesizer,
	}
	faults := []websocketFault{faultNormal, faultDecode, faultRemote}
	for _, service := range services {
		for _, fault := range faults {
			t.Run(string(service)+"/"+string(fault), func(t *testing.T) {
				harness := newFixtureWebSocketHarness(t)
				defer harness.Close()
				coordinator, waiter := newWebSocketCoordinator(t, harness)
				if err := coordinator.Start(context.Background(), "fixture-session", "sincro"); err != nil {
					t.Fatalf("Start() error = %v", err)
				}
				runWebSocketTurn(t, coordinator, 1)
				oldWork := transientWorkForTest(t, coordinator)
				seedTransientState(oldWork)
				if err := coordinator.publishText(
					1,
					pclient.ServiceProcessor,
					protocol.ChatMessage{SpeechID: 42, MessageID: "old-buffer"},
				); err != nil {
					t.Fatalf("publish old buffered output: %v", err)
				}
				beforeAccept := harness.acceptCounts()
				beforeSynth := harness.synthRequestCount()
				harness.resolver.failNextExtractor.Store(true)
				harness.fail(service, fault)
				waitForGeneration(t, coordinator, 2)

				if got := waiter.retryCount(); got != 1 {
					t.Fatalf("retry waiter count = %d, want 1", got)
				}
				if waiter.lastRetry() != RetryMin {
					t.Fatalf("retry delay = %v, want %v", waiter.lastRetry(), RetryMin)
				}
				harness.waitActive(t, 4)
				harness.assertAcceptedDelta(t, beforeAccept, 1)
				assertTransientReset(t, coordinator, oldWork)
				if len(coordinator.textOut) != 0 || len(coordinator.synthOut) != 0 {
					t.Fatalf("old output survived reset: text=%d synth=%d", len(coordinator.textOut), len(coordinator.synthOut))
				}
				if err := coordinator.publishText(
					1,
					pclient.ServiceProcessor,
					protocol.ChatMessage{SpeechID: 42, MessageID: "late"},
				); err != nil {
					t.Fatalf("publish stale output error = %v", err)
				}
				if len(coordinator.textOut) != 0 {
					t.Fatal("late generation-1 output reached external channel")
				}
				coordinator.mu.Lock()
				staleDrops := coordinator.staleDrops[pclient.ServiceProcessor]
				coordinator.mu.Unlock()
				if staleDrops != 1 {
					t.Fatalf("processor stale drop count = %d, want 1", staleDrops)
				}

				runWebSocketTurn(t, coordinator, 2)
				harness.assertStrictExtractorIdentities(t)
				if harness.processorHistoryLength() != 3 {
					t.Fatalf("post-reset processor history length = %d, want 3", harness.processorHistoryLength())
				}
				if harness.synthRequestCount() != beforeSynth+1 {
					t.Fatalf("in-flight TTS was resent: synth count=%d want=%d",
						harness.synthRequestCount(), beforeSynth+1)
				}
				if err := coordinator.Close(); err != nil {
					t.Fatalf("Close() error = %v", err)
				}
				harness.waitActive(t, 0)
				harness.assertNoError(t)
			})
		}
	}
}

func TestFixtureWebSocketSimultaneousFailureAndRepeatedResetDoNotLeak(t *testing.T) {
	baseline := runtimeGoroutines()
	harness := newFixtureWebSocketHarness(t)
	defer harness.Close()
	coordinator, _ := newWebSocketCoordinator(t, harness)
	if err := coordinator.Start(context.Background(), "fixture-session", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	runWebSocketTurn(t, coordinator, 1)

	generation := uint64(1)
	for attempt := 0; attempt < 8; attempt++ {
		before := harness.acceptCounts()
		harness.fail(pclient.ServiceExtractor, faultRemote)
		harness.fail(pclient.ServiceProcessor, faultNormal)
		generation++
		waitForGeneration(t, coordinator, generation)
		harness.waitActive(t, 4)
		harness.assertAcceptedDelta(t, before, 1)
		if len(coordinator.textOut) != 0 || len(coordinator.synthOut) != 0 {
			t.Fatal("old generation output remained after repeated reset")
		}
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	harness.waitActive(t, 0)
	waitFor(t, func() bool { return runtimeGoroutines() <= baseline+5 })
	harness.assertNoError(t)
}

func runWebSocketTurn(t *testing.T, coordinator *Coordinator, generation uint64) {
	t.Helper()
	frame := make([]byte, pcmFrameBytes)
	if err := coordinator.SubmitPCM(frame); err != nil {
		t.Fatalf("SubmitPCM() error = %v", err)
	}
	user := receive(t, coordinator.TextResults())
	assistant := receive(t, coordinator.TextResults())
	voice := receive(t, coordinator.SynthResults())
	if user.Generation != generation || assistant.Generation != generation || voice.Generation != generation {
		t.Fatalf("turn output generations = %d/%d/%d, want %d",
			user.Generation, assistant.Generation, voice.Generation, generation)
	}
	if user.Value.Message != "固定文" || assistant.Value.Message != "固定された応答文" {
		t.Fatalf("fixture text outputs = %q / %q", user.Value.Message, assistant.Value.Message)
	}
	if len(voice.Value.Voice) == 0 || !bytes.HasPrefix(voice.Value.Voice, []byte("OggS")) {
		t.Fatal("fixture synthesized voice is not Ogg")
	}
}

func transientWorkForTest(t *testing.T, coordinator *Coordinator) *generationWork {
	t.Helper()
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if coordinator.work == nil {
		t.Fatal("coordinator has no generation work")
	}
	return coordinator.work
}

func seedTransientState(work *generationWork) {
	work.conv.mu.Lock()
	work.conv.currentUser = &protocol.ChatMessage{SpeechID: 99, MessageID: "partial"}
	work.conv.requests[99] = protocol.ProcessorRequest{SessionID: "fixture-session", SequenceID: 99}
	work.conv.mu.Unlock()
}

func assertTransientReset(t *testing.T, coordinator *Coordinator, oldWork *generationWork) {
	t.Helper()
	coordinator.mu.Lock()
	newWork := coordinator.work
	coordinator.mu.Unlock()
	if newWork == nil || newWork == oldWork || newWork.conv == oldWork.conv || newWork.input == oldWork.input {
		t.Fatal("reset reused generation work, conversation, or input queue")
	}
	oldWork.input.mu.Lock()
	oldQueueClosed := oldWork.input.closed
	oldWork.input.mu.Unlock()
	if !oldQueueClosed {
		t.Fatal("reset did not close the old input queue")
	}
	newWork.conv.mu.Lock()
	defer newWork.conv.mu.Unlock()
	if newWork.conv.currentUser != nil || len(newWork.conv.requests) != 0 ||
		len(newWork.conv.outstanding) != 0 {
		t.Fatal("new generation inherited transient conversation state")
	}
}

func waitForGeneration(t *testing.T, coordinator *Coordinator, generation uint64) {
	t.Helper()
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == generation
	})
}
