package pipeline

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"reflect"
	"runtime"
	"sync"
	"testing"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestCoordinatorRunsFixtureBackedFourStageConversation(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := coordinator.Start(ctx, "session-1", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	frame := make([]byte, pcmFrameBytes)
	frame[0] = 42
	if err := coordinator.SubmitPCM(frame); err != nil {
		t.Fatalf("SubmitPCM() error = %v", err)
	}
	frame[0] = 0

	user := receive(t, coordinator.TextResults())
	assistant := receive(t, coordinator.TextResults())
	voice := receive(t, coordinator.SynthResults())
	if user.Generation != 1 || assistant.Generation != 1 || voice.Generation != 1 {
		t.Fatalf("outputs used wrong generation: user=%d assistant=%d voice=%d",
			user.Generation, assistant.Generation, voice.Generation)
	}
	if user.Value.Message != "fixture recognized" || assistant.Value.Message != "fixture response" {
		t.Fatalf("unexpected text outputs: user=%q assistant=%q", user.Value.Message, assistant.Value.Message)
	}
	if string(voice.Value.Voice) != "encoded-voice" || voice.Value.SpeakingTime <= 0 {
		t.Fatalf("unexpected synthesized output: %+v", voice.Value)
	}

	set := factory.setAt(t, 0)
	if set.extractor.lastPCM[0] != 42 {
		t.Fatal("SubmitPCM retained the caller slice instead of its defensive copy")
	}
	if len(set.processor.lastRequest.History.Messages) != 1 ||
		set.processor.lastRequest.History.Messages[0].Message != "fixture recognized" {
		t.Fatalf("confirmed user was not included in processor history: %+v", set.processor.lastRequest)
	}
	if set.synth.lastResult.Raw == nil {
		t.Fatal("processor raw bytes were not forwarded to synthesizer")
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	assertClosedOutputs(t, coordinator)
}

func TestCoordinatorSendsInitialPartialProcessorRequestWithEmptyHistory(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-initial-partial", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	set := factory.setAt(t, 0)
	set.extractor.onPCM = func([]byte) {
		set.extractor.results <- protocol.ExtractorResult{
			SessionID: "session-initial-partial", SpeechID: 1, SequenceID: 1, Confirmed: false,
		}
	}
	if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatalf("SubmitPCM() error = %v", err)
	}
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.SynthResults())
	request := set.processor.lastRequest
	if request.Confirmed || request.History.Messages == nil || len(request.History.Messages) != 0 {
		t.Fatalf("initial partial processor request = %+v", request)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestCoordinatorForwardsEachExtractorPartialWithoutAccumulation(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-partials", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	set := factory.setAt(t, 0)
	forwarded := make(chan protocol.ExtractorResult, 3)
	set.extractor.onPCM = func(frame []byte) {
		sequence := int64(frame[0])
		set.extractor.results <- protocol.ExtractorResult{
			SessionID: "session-partials", SpeechID: 1, SequenceID: sequence,
			Confirmed: sequence == 3, Voice: append([]byte(nil), frame...),
			VoiceDType: "int16", VoiceSamplingRate: 16_000, VoiceSampleBytes: 2, VoiceChannels: 1,
		}
	}
	set.recognizer.onExtraction = func(value protocol.ExtractorResult) { forwarded <- value }
	frames := make([][]byte, 3)
	for index := range frames {
		frames[index] = make([]byte, pcmFrameBytes)
		frames[index][0] = byte(index + 1)
		if err := coordinator.SubmitPCM(frames[index]); err != nil {
			t.Fatalf("SubmitPCM(%d) error = %v", index, err)
		}
	}
	for index, want := range frames {
		got := receive(t, forwarded)
		if !bytes.Equal(got.Voice, want) {
			t.Fatalf("partial %d voice = %d bytes, want only its %d-byte frame", index, len(got.Voice), len(want))
		}
		if got.Confirmed != (index == len(frames)-1) {
			t.Fatalf("partial %d confirmed = %t", index, got.Confirmed)
		}
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestCloneMessagesNormalizesNilAndCopiesValues(t *testing.T) {
	if cloned := cloneMessages(nil); cloned == nil || len(cloned) != 0 {
		t.Fatalf("cloneMessages(nil) = %#v, want non-nil empty slice", cloned)
	}
	values := []protocol.ChatMessage{{Message: "before"}}
	cloned := cloneMessages(values)
	values[0].Message = "after"
	if cloned[0].Message != "before" {
		t.Fatalf("cloneMessages() retained input backing array: got %q", cloned[0].Message)
	}
}

func TestCoordinatorPublishesInitialAndResetGenerationChanges(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-generation", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if generation := receive(t, coordinator.GenerationChanges()); generation != 1 {
		t.Fatalf("initial generation = %d, want 1", generation)
	}
	factory.setAt(t, 0).emit(pclient.Event{
		Service: pclient.ServiceRecognizer,
		Kind:    pclient.EventRemoteClose,
		Err:     errors.New("advance"),
	})
	if generation := receive(t, coordinator.GenerationChanges()); generation != 2 {
		t.Fatalf("reset generation = %d, want 2", generation)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	assertChannelEventuallyClosed(t, coordinator.GenerationChanges(), "generation")
}

func TestCoordinatorResetIsSingleFlightAndPreservesConfirmedHistory(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-reset", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatalf("SubmitPCM() error = %v", err)
	}
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.SynthResults())

	first := factory.setAt(t, 0)
	first.emit(pclient.Event{Service: pclient.ServiceRecognizer, Kind: pclient.EventRemoteClose, Err: errors.New("closed")})
	first.emit(pclient.Event{Service: pclient.ServiceProcessor, Kind: pclient.EventReadFailed, Err: errors.New("same failure")})
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == 2
	})
	if factory.count() != 2 {
		t.Fatalf("single failure generation made %d sets, want 2", factory.count())
	}
	if first.closeCount() != 1 {
		t.Fatalf("old set Close count = %d, want 1", first.closeCount())
	}
	if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatalf("SubmitPCM() after reset error = %v", err)
	}
	secondUser := receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.SynthResults())
	if secondUser.Generation != 2 {
		t.Fatalf("post-reset generation = %d, want 2", secondUser.Generation)
	}
	second := factory.setAt(t, 1)
	if len(second.processor.lastRequest.History.Messages) < 3 {
		t.Fatalf("confirmed history was not carried across reset: %+v", second.processor.lastRequest.History)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestCoordinatorResetsForEveryServiceTerminalKind(t *testing.T) {
	services := []pclient.Service{
		pclient.ServiceExtractor, pclient.ServiceRecognizer,
		pclient.ServiceProcessor, pclient.ServiceSynthesizer,
	}
	kinds := []pclient.EventKind{
		pclient.EventRemoteClose, pclient.EventDecodeFailed, pclient.EventReadFailed,
	}
	for _, service := range services {
		for _, kind := range kinds {
			t.Run(string(service)+"/"+string(kind), func(t *testing.T) {
				factory := &fakeFactory{t: t}
				coordinator := newTestCoordinator(t, factory)
				if err := coordinator.Start(context.Background(), "session-table", "sincro"); err != nil {
					t.Fatalf("Start() error = %v", err)
				}
				factory.setAt(t, 0).emit(pclient.Event{Service: service, Kind: kind, Err: errors.New("injected")})
				waitFor(t, func() bool {
					coordinator.mu.Lock()
					defer coordinator.mu.Unlock()
					return coordinator.state == StateRunning && coordinator.generation == 2
				})
				if factory.count() != 2 {
					t.Fatalf("client set count = %d, want 2", factory.count())
				}
				if err := coordinator.Close(); err != nil {
					t.Fatalf("Close() error = %v", err)
				}
			})
		}
	}
}

func TestCoordinatorRepeatedCloseDoesNotLeakGenerationWorkers(t *testing.T) {
	baseline := runtime.NumGoroutine()
	for attempt := 0; attempt < 10; attempt++ {
		factory := &fakeFactory{t: t}
		coordinator := newTestCoordinator(t, factory)
		if err := coordinator.Start(context.Background(), "session-leak", "sincro"); err != nil {
			t.Fatalf("attempt %d Start() error = %v", attempt, err)
		}
		if err := coordinator.Close(); err != nil {
			t.Fatalf("attempt %d first Close() error = %v", attempt, err)
		}
		if err := coordinator.Close(); err != nil {
			t.Fatalf("attempt %d second Close() error = %v", attempt, err)
		}
		if factory.setAt(t, 0).closeCount() != 1 {
			t.Fatalf("attempt %d client set was not close-once", attempt)
		}
	}
	waitFor(t, func() bool { return runtime.NumGoroutine() <= baseline+5 })
}

func TestCoordinatorLifecycleQueueAndBackoff(t *testing.T) {
	t.Run("close during start", func(t *testing.T) {
		factory := &blockingFactory{entered: make(chan struct{})}
		coordinator := newTestCoordinator(t, factory)
		result := make(chan error, 1)
		go func() { result <- coordinator.Start(context.Background(), "session-close", "sincro") }()
		<-factory.entered
		if err := coordinator.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if err := <-result; !errors.Is(err, ErrClosed) {
			t.Fatalf("Start() error = %v, want ErrClosed", err)
		}
	})

	t.Run("drop oldest and fixed retry caps", func(t *testing.T) {
		queue := newFrameQueue()
		for value := byte(0); value < inputQueueCapacity+1; value++ {
			queue.push([]byte{value})
		}
		frame, ok := queue.pop(context.Background())
		if !ok || frame[0] != 1 {
			t.Fatalf("oldest retained frame = %v/%t, want [1]/true", frame, ok)
		}
		var caps []time.Duration
		coordinator, err := newCoordinatorWithHooks(
			&fakeFactory{t: t}, slog.New(slog.NewTextHandler(io.Discard, nil)),
			func(cap time.Duration) (time.Duration, error) {
				caps = append(caps, cap)
				return 0, nil
			},
			immediateWait,
		)
		if err != nil {
			t.Fatalf("newCoordinatorWithHooks() error = %v", err)
		}
		for attempt := uint(0); attempt <= 7; attempt++ {
			if _, err := coordinator.retryDelay(attempt); err != nil {
				t.Fatalf("retryDelay(%d) error = %v", attempt, err)
			}
		}
		want := []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 30 * time.Second, 30 * time.Second, 30 * time.Second}
		if !reflect.DeepEqual(caps, want) {
			t.Fatalf("retry caps = %v, want %v", caps, want)
		}
	})
}

func TestCoordinatorKeepsExtractorIdentityAcrossReset(t *testing.T) {
	tests := []struct {
		name       string
		identities []testExtractionIdentity
	}{
		{
			name: "speech ID reuse",
			identities: []testExtractionIdentity{
				{speechID: 10, sequenceID: 100},
				{speechID: 10, sequenceID: 101},
				{speechID: 11, sequenceID: 102},
			},
		},
		{
			name: "sequence ID reuse",
			identities: []testExtractionIdentity{
				{speechID: 10, sequenceID: 100},
				{speechID: 11, sequenceID: 100},
				{speechID: 12, sequenceID: 101},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			factory := &fakeFactory{t: t, identities: test.identities}
			coordinator := newTestCoordinator(t, factory)
			if err := coordinator.Start(context.Background(), "session-identity", "sincro"); err != nil {
				t.Fatalf("Start() error = %v", err)
			}
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("first SubmitPCM() error = %v", err)
			}
			_ = receive(t, coordinator.TextResults())
			_ = receive(t, coordinator.TextResults())
			_ = receive(t, coordinator.SynthResults())
			factory.setAt(t, 0).emit(pclient.Event{
				Service: pclient.ServiceRecognizer,
				Kind:    pclient.EventRemoteClose,
				Err:     errors.New("advance generation"),
			})
			waitForGeneration(t, coordinator, 2)
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("reused identity SubmitPCM() error = %v", err)
			}
			// The protocol failure belongs to generation 2 and must reset that
			// generation rather than being treated as a stale generation-1 result.
			waitForGeneration(t, coordinator, 3)
			if factory.count() != 3 {
				t.Fatalf("client set count = %d, want 3", factory.count())
			}
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("strict identity SubmitPCM() error = %v", err)
			}
			if output := receive(t, coordinator.TextResults()); output.Generation != 3 {
				t.Fatalf("strict identity output generation = %d, want 3", output.Generation)
			}
			if err := coordinator.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
}

func TestCoordinatorCountsPCMDropsAcrossQueueReplacement(t *testing.T) {
	coordinator := newTestCoordinator(t, &fakeFactory{t: t})
	coordinator.mu.Lock()
	coordinator.state = StateRunning
	coordinator.work = &generationWork{input: newFrameQueue()}
	coordinator.mu.Unlock()

	fill := func() {
		for range inputQueueCapacity + 1 {
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("SubmitPCM() error = %v", err)
			}
		}
	}
	fill()
	coordinator.mu.Lock()
	coordinator.work.input = newFrameQueue()
	coordinator.mu.Unlock()
	fill()
	coordinator.mu.Lock()
	drops := coordinator.pcmDrops
	coordinator.mu.Unlock()
	if drops != 2 {
		t.Fatalf("session PCM drop count = %d, want 2", drops)
	}
}

func TestConversationRejectsProcessorIntermediateFinalMixups(t *testing.T) {
	conv := newConversation("session")
	user := protocol.ChatMessage{SpeechID: 1, MessageID: "user", MessageType: "user", Message: "hello"}
	request := protocol.ProcessorRequest{
		SessionID: "session", SequenceID: 10, Confirmed: true,
		History: protocol.ChatHistory{Messages: []protocol.ChatMessage{user}}, RequestMessage: user,
	}
	conv.rememberRequest(request)
	response := protocol.ChatMessage{SpeechID: 1, MessageID: "assistant", MessageType: "assistant", Message: "hi"}
	intermediate := protocol.ProcessorResult{
		SessionID: "session", SequenceID: 10, Confirmed: true,
		History: request.History, RequestMessage: user, ResponseMessage: response,
	}
	if _, final, err := conv.validateProcessor(intermediate); err != nil || final {
		t.Fatalf("valid intermediate = final %v, error %v", final, err)
	}
	invalidFinal := intermediate
	invalidFinal.EndOfResponse = true
	if _, _, err := conv.validateProcessor(invalidFinal); err == nil {
		t.Fatal("final result accepted request history without response")
	}
	final := intermediate
	final.EndOfResponse = true
	final.History.Messages = append(cloneMessages(request.History.Messages), response)
	if _, isFinal, err := conv.validateProcessor(final); err != nil || !isFinal {
		t.Fatalf("valid final = final %v, error %v", isFinal, err)
	}
	if _, _, err := conv.validateProcessor(final); err == nil {
		t.Fatal("duplicate final result was accepted")
	}
}

func TestConversationRejectsSpeechIDRegression(t *testing.T) {
	conv := newConversation("session")
	first := protocol.ExtractorResult{SessionID: "session", SpeechID: 10, SequenceID: 1, Confirmed: true}
	if _, err := conv.acceptExtraction(first); err != nil {
		t.Fatalf("first confirmed extraction error = %v", err)
	}
	regressed := protocol.ExtractorResult{SessionID: "session", SpeechID: 9, SequenceID: 2, Confirmed: true}
	if _, err := conv.acceptExtraction(regressed); err == nil {
		t.Fatal("acceptExtraction() accepted a regressed speech ID")
	}
}

func TestCapturedGenerationDropsLateClientEvent(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-generation", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	first := factory.setAt(t, 0)
	first.emit(pclient.Event{Service: pclient.ServiceRecognizer, Kind: pclient.EventRemoteClose, Err: errors.New("reset")})
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == 2
	})
	first.emit(pclient.Event{Service: pclient.ServiceProcessor, Kind: pclient.EventReadFailed, Err: errors.New("late")})
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.staleDrops[pclient.ServiceProcessor] == 1
	})
	coordinator.mu.Lock()
	generation := coordinator.generation
	coordinator.mu.Unlock()
	if generation != 2 {
		t.Fatalf("late generation-1 callback advanced generation to %d", generation)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestOutputBackpressureUsesGenerationBarrierAndCloseOwnership(t *testing.T) {
	factory := &fakeFactory{t: t}
	waiter := newControlledWaiter()
	coordinator, err := newCoordinatorWithHooks(
		factory,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		waiter.wait,
	)
	if err != nil {
		t.Fatalf("newCoordinatorWithHooks() error = %v", err)
	}
	if err := coordinator.Start(context.Background(), "session-output", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	message := protocol.ChatMessage{SpeechID: 1, MessageID: "output", MessageType: "assistant"}
	if err := coordinator.publishText(1, pclient.ServiceProcessor, message); err != nil {
		t.Fatalf("publish handed output error = %v", err)
	}
	handed := receive(t, coordinator.TextResults())
	for range outputQueueCapacity {
		if err := coordinator.publishText(1, pclient.ServiceProcessor, message); err != nil {
			t.Fatalf("fill output error = %v", err)
		}
	}
	waiter.discardOutputRequests(t, outputQueueCapacity+1)

	publishDone := make(chan error, 1)
	go func() {
		err := coordinator.publishText(1, pclient.ServiceProcessor, message)
		if err != nil {
			coordinator.requestReset(1, pclient.ServiceProcessor, resetCauseRuntimeError)
		}
		publishDone <- err
	}()
	waiter.expireNextOutput(t)
	if err := receive(t, publishDone); err == nil {
		t.Fatal("full output channel did not time out")
	}
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == 2
	})
	if len(coordinator.textOut) != 0 {
		t.Fatalf("reset left %d old buffered text outputs", len(coordinator.textOut))
	}
	if handed.Generation != 1 {
		t.Fatalf("already handed output generation = %d, want 1", handed.Generation)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	assertClosedOutputs(t, coordinator)
}

func TestClientEventPublicationWindows(t *testing.T) {
	for _, window := range []eventWindow{
		windowBeforeConnectReturn,
		windowReturnBeforeActivate,
		windowActivateBeforeRunning,
	} {
		t.Run(string(window), func(t *testing.T) {
			factory := &windowFactory{t: t, window: window}
			coordinator := newTestCoordinator(t, factory)
			if err := coordinator.Start(context.Background(), "session-window", "sincro"); err != nil {
				t.Fatalf("Start() error = %v", err)
			}
			wantGeneration := uint64(1)
			if window == windowActivateBeforeRunning {
				wantGeneration = 2
				waitForGeneration(t, coordinator, wantGeneration)
			}
			coordinator.mu.Lock()
			generation := coordinator.generation
			coordinator.mu.Unlock()
			if generation != wantGeneration {
				t.Fatalf("generation = %d, want %d", generation, wantGeneration)
			}
			if factory.count() != 2 {
				t.Fatalf("client set attempts = %d, want 2", factory.count())
			}
			if factory.firstCloseCount() != 1 {
				t.Fatalf("failed/published first set Close count = %d, want 1", factory.firstCloseCount())
			}
			if err := coordinator.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
}

func TestCloseConvergesDuringResetAndBackpressure(t *testing.T) {
	t.Run("reset reconnect", func(t *testing.T) {
		factory := &closeRaceFactory{t: t, reconnectEntered: make(chan struct{})}
		coordinator := newTestCoordinator(t, factory)
		if err := coordinator.Start(context.Background(), "session-reset-close", "sincro"); err != nil {
			t.Fatalf("Start() error = %v", err)
		}
		factory.first().emit(pclient.Event{
			Service: pclient.ServiceExtractor,
			Kind:    pclient.EventRemoteClose,
			Err:     errors.New("reset"),
		})
		select {
		case <-factory.reconnectEntered:
		case <-time.After(time.Second):
			t.Fatal("reset did not enter reconnect")
		}
		closeDone := make(chan error, 2)
		go func() { closeDone <- coordinator.Close() }()
		go func() { closeDone <- coordinator.Close() }()
		for range 2 {
			if err := receive(t, closeDone); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		}
		if factory.first().closeCount() != 1 {
			t.Fatalf("old set Close count = %d, want 1", factory.first().closeCount())
		}
		assertClosedOutputs(t, coordinator)
	})

	t.Run("output timeout", func(t *testing.T) {
		factory := &fakeFactory{t: t}
		waiter := newControlledWaiter()
		coordinator, err := newCoordinatorWithHooks(
			factory,
			slog.New(slog.NewTextHandler(io.Discard, nil)),
			func(time.Duration) (time.Duration, error) { return 0, nil },
			waiter.wait,
		)
		if err != nil {
			t.Fatalf("newCoordinatorWithHooks() error = %v", err)
		}
		if err := coordinator.Start(context.Background(), "session-timeout-close", "sincro"); err != nil {
			t.Fatalf("Start() error = %v", err)
		}
		message := protocol.ChatMessage{SpeechID: 1, MessageID: "full"}
		for range outputQueueCapacity {
			if err := coordinator.publishText(1, pclient.ServiceProcessor, message); err != nil {
				t.Fatalf("fill output error = %v", err)
			}
		}
		waiter.discardOutputRequests(t, outputQueueCapacity)
		publishDone := make(chan error, 1)
		go func() {
			err := coordinator.publishText(1, pclient.ServiceProcessor, message)
			if err != nil {
				coordinator.requestReset(1, pclient.ServiceProcessor, resetCauseRuntimeError)
			}
			publishDone <- err
		}()
		waiter.expireNextOutput(t)
		closeDone := make(chan error, 1)
		go func() { closeDone <- coordinator.Close() }()
		if err := receive(t, publishDone); err == nil {
			t.Fatal("backpressure publish succeeded")
		}
		if err := receive(t, closeDone); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		assertClosedOutputs(t, coordinator)
	})
}

func newTestCoordinator(t *testing.T, factory ClientSetFactory) *Coordinator {
	t.Helper()
	coordinator, err := newCoordinatorWithHooks(
		factory, slog.New(slog.NewTextHandler(io.Discard, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		nonExpiringOutputWait,
	)
	if err != nil {
		t.Fatalf("newCoordinatorWithHooks() error = %v", err)
	}
	return coordinator
}

func immediateWait(ctx context.Context, _ time.Duration) <-chan error {
	result := make(chan error, 1)
	select {
	case <-ctx.Done():
		result <- ctx.Err()
	default:
		result <- nil
	}
	return result
}

func nonExpiringOutputWait(ctx context.Context, delay time.Duration) <-chan error {
	if delay != outputBackpressure {
		return immediateWait(ctx, delay)
	}
	result := make(chan error, 1)
	go func() {
		<-ctx.Done()
		result <- ctx.Err()
	}()
	return result
}

func receive[T any](t *testing.T, values <-chan T) T {
	t.Helper()
	select {
	case value := <-values:
		return value
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for pipeline value")
		var zero T
		return zero
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		if condition() {
			return
		}
		select {
		case <-deadline.C:
			t.Fatal("timed out waiting for condition")
		case <-ticker.C:
		}
	}
}

func assertClosedOutputs(t *testing.T, coordinator *Coordinator) {
	t.Helper()
	assertChannelEventuallyClosed(t, coordinator.TextResults(), "text")
	assertChannelEventuallyClosed(t, coordinator.SynthResults(), "synth")
}

func assertChannelEventuallyClosed[T any](t *testing.T, values <-chan T, name string) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		select {
		case _, ok := <-values:
			if !ok {
				return
			}
		case <-deadline.C:
			t.Fatalf("%s output remained open after Close", name)
		}
	}
}

type fakeFactory struct {
	t          *testing.T
	mu         sync.Mutex
	sets       []*fakeSet
	identities []testExtractionIdentity
}

type testExtractionIdentity struct {
	speechID   int64
	sequenceID int64
}

func (f *fakeFactory) Connect(_ context.Context, sessionID, _ string) (ClientSet, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	identity := testExtractionIdentity{
		speechID: int64(len(f.sets) + 1), sequenceID: int64(len(f.sets) + 1),
	}
	if len(f.sets) < len(f.identities) {
		identity = f.identities[len(f.sets)]
	}
	set := newFakeSet(f.t, sessionID, identity.speechID, identity.sequenceID)
	f.sets = append(f.sets, set)
	return set, nil
}

func (f *fakeFactory) setAt(t *testing.T, index int) *fakeSet {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if index >= len(f.sets) {
		t.Fatalf("set index %d missing", index)
	}
	return f.sets[index]
}

func (f *fakeFactory) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sets)
}

type blockingFactory struct {
	entered chan struct{}
	once    sync.Once
}

type eventWindow string

const (
	windowBeforeConnectReturn   eventWindow = "connect-return-before"
	windowReturnBeforeActivate  eventWindow = "return-activate"
	windowActivateBeforeRunning eventWindow = "activate-running"
)

type windowFactory struct {
	t      *testing.T
	window eventWindow
	mu     sync.Mutex
	sets   []*windowSet
}

func (f *windowFactory) Connect(_ context.Context, sessionID, _ string) (ClientSet, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	identity := int64(len(f.sets) + 1)
	base := newFakeSet(f.t, sessionID, identity, identity)
	set := &windowSet{fakeSet: base}
	if len(f.sets) == 0 {
		set.window = f.window
		if f.window == windowBeforeConnectReturn {
			set.pending = true
		}
	}
	f.sets = append(f.sets, set)
	return set, nil
}

func (f *windowFactory) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sets)
}

func (f *windowFactory) firstCloseCount() int {
	f.mu.Lock()
	first := f.sets[0]
	f.mu.Unlock()
	return first.closeCount()
}

type windowSet struct {
	*fakeSet
	window  eventWindow
	pending bool
}

func (s *windowSet) Activate(handler func(pclient.Event)) error {
	if s.pending || s.window == windowReturnBeforeActivate {
		return errors.New("client failed before publication")
	}
	if err := s.fakeSet.Activate(handler); err != nil {
		return err
	}
	if s.window == windowActivateBeforeRunning {
		go handler(pclient.Event{
			Service: pclient.ServiceRecognizer,
			Kind:    pclient.EventRemoteClose,
			Err:     errors.New("event after activation"),
		})
	}
	return nil
}

type closeRaceFactory struct {
	t                *testing.T
	mu               sync.Mutex
	firstSet         *fakeSet
	attempts         int
	reconnectEntered chan struct{}
}

func (f *closeRaceFactory) Connect(ctx context.Context, sessionID, _ string) (ClientSet, error) {
	f.mu.Lock()
	f.attempts++
	attempt := f.attempts
	if attempt == 1 {
		f.firstSet = newFakeSet(f.t, sessionID, 1, 1)
		set := f.firstSet
		f.mu.Unlock()
		return set, nil
	}
	if attempt == 2 {
		close(f.reconnectEntered)
	}
	f.mu.Unlock()
	<-ctx.Done()
	return nil, ctx.Err()
}

func (f *closeRaceFactory) first() *fakeSet {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.firstSet
}

type controlledWaiter struct {
	requests chan chan error
}

func newControlledWaiter() *controlledWaiter {
	return &controlledWaiter{requests: make(chan chan error, 64)}
}

func (w *controlledWaiter) wait(ctx context.Context, delay time.Duration) <-chan error {
	if delay != outputBackpressure {
		return immediateWait(ctx, delay)
	}
	result := make(chan error, 1)
	w.requests <- result
	return result
}

func (w *controlledWaiter) discardOutputRequests(t *testing.T, count int) {
	t.Helper()
	for range count {
		select {
		case <-w.requests:
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for output waiter registration")
		}
	}
}

func (w *controlledWaiter) expireNextOutput(t *testing.T) {
	t.Helper()
	select {
	case result := <-w.requests:
		result <- nil
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for blocked output waiter")
	}
}

func (f *blockingFactory) Connect(ctx context.Context, _, _ string) (ClientSet, error) {
	f.once.Do(func() { close(f.entered) })
	<-ctx.Done()
	return nil, ctx.Err()
}

type fakeSet struct {
	extractor  *fakeExtractor
	recognizer *fakeRecognizer
	processor  *fakeProcessor
	synth      *fakeSynth
	mu         sync.Mutex
	handler    func(pclient.Event)
	closes     int
}

func newFakeSet(t *testing.T, sessionID string, speechID, sequenceID int64) *fakeSet {
	t.Helper()
	payload, err := os.ReadFile("protocol/testdata/extractor_result.msgpack")
	if err != nil {
		t.Fatalf("read Python-generated fixture: %v", err)
	}
	fixture, err := protocol.DecodeExtractorResult(payload)
	if err != nil {
		t.Fatalf("decode Python-generated fixture: %v", err)
	}
	extractor := &fakeExtractor{results: make(chan protocol.ExtractorResult, 1), events: make(chan pclient.Event, 1)}
	recognizer := &fakeRecognizer{results: make(chan protocol.RecognizerResult, 1), events: make(chan pclient.Event, 1)}
	processor := &fakeProcessor{results: make(chan protocol.ProcessorResult, 1), events: make(chan pclient.Event, 1)}
	synth := &fakeSynth{results: make(chan protocol.SynthesizerResult, 1), events: make(chan pclient.Event, 1)}
	extractor.onPCM = func(frame []byte) {
		fixture.SessionID, fixture.SpeechID, fixture.SequenceID = sessionID, speechID, sequenceID
		fixture.Confirmed = true
		fixture.Voice = append([]byte(nil), frame...)
		fixture.VoiceDType, fixture.VoiceSamplingRate = "int16", 16_000
		fixture.VoiceSampleBytes, fixture.VoiceChannels = 2, 1
		extractor.results <- fixture
	}
	recognizer.onExtraction = func(value protocol.ExtractorResult) {
		recognizer.results <- protocol.RecognizerResult{
			SessionID: value.SessionID, SpeechID: value.SpeechID, SequenceID: value.SequenceID,
			StartAt: value.StartAt, Confirmed: value.Confirmed,
			Result: []protocol.RecognitionToken{{Text: "fixture recognized", Score: 1}},
		}
	}
	processor.onRequest = func(request protocol.ProcessorRequest) {
		response := protocol.ChatMessage{
			SpeechID: request.RequestMessage.SpeechID, MessageID: "assistant",
			MessageType: "assistant", SpeakerID: "assistant", SpeakerName: "Assistant",
			Message: "fixture response",
		}
		voiceText := response.Message
		processor.results <- protocol.ProcessorResult{
			SessionID: request.SessionID, SequenceID: request.SequenceID, Confirmed: request.Confirmed,
			History:        protocol.ChatHistory{Messages: append(cloneMessages(request.History.Messages), response)},
			RequestMessage: request.RequestMessage, ResponseMessage: response, EndOfResponse: true,
			VoiceText: &voiceText, Raw: []byte{0x81, 0xa1, 0x78, 0x01},
		}
	}
	synth.onResult = func(value protocol.ProcessorResult) {
		synth.results <- protocol.SynthesizerResult{
			SpeechID: value.ResponseMessage.SpeechID, Message: *value.VoiceText,
			MoraQueue: []protocol.SynthesizerMora{{Length: 0.1}}, SpeakingTime: 0.1,
			Voice: []byte("encoded-voice"), AudioFormat: "audio/wav",
		}
	}
	return &fakeSet{extractor: extractor, recognizer: recognizer, processor: processor, synth: synth}
}

func (s *fakeSet) Extractor() ExtractorClient     { return s.extractor }
func (s *fakeSet) Recognizer() RecognizerClient   { return s.recognizer }
func (s *fakeSet) Processor() ProcessorClient     { return s.processor }
func (s *fakeSet) Synthesizer() SynthesizerClient { return s.synth }
func (s *fakeSet) Activate(handler func(pclient.Event)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handler = handler
	return nil
}
func (s *fakeSet) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closes++
	return nil
}
func (s *fakeSet) emit(event pclient.Event) {
	s.mu.Lock()
	handler := s.handler
	s.mu.Unlock()
	if handler != nil {
		handler(event)
	}
}
func (s *fakeSet) closeCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closes
}

type fakeExtractor struct {
	results chan protocol.ExtractorResult
	events  chan pclient.Event
	onPCM   func([]byte)
	lastPCM []byte
}

func (c *fakeExtractor) SendPCM(_ context.Context, frame []byte) error {
	c.lastPCM = append([]byte(nil), frame...)
	c.onPCM(frame)
	return nil
}
func (c *fakeExtractor) Results() <-chan protocol.ExtractorResult { return c.results }
func (c *fakeExtractor) Events() <-chan pclient.Event             { return c.events }

type fakeRecognizer struct {
	results      chan protocol.RecognizerResult
	events       chan pclient.Event
	onExtraction func(protocol.ExtractorResult)
}

func (c *fakeRecognizer) SendExtraction(_ context.Context, value protocol.ExtractorResult) error {
	c.onExtraction(value)
	return nil
}
func (c *fakeRecognizer) Results() <-chan protocol.RecognizerResult { return c.results }
func (c *fakeRecognizer) Events() <-chan pclient.Event              { return c.events }

type fakeProcessor struct {
	results     chan protocol.ProcessorResult
	events      chan pclient.Event
	onRequest   func(protocol.ProcessorRequest)
	lastRequest protocol.ProcessorRequest
}

func (c *fakeProcessor) SendRequest(_ context.Context, value protocol.ProcessorRequest) error {
	c.lastRequest = value
	c.onRequest(value)
	return nil
}
func (c *fakeProcessor) Results() <-chan protocol.ProcessorResult { return c.results }
func (c *fakeProcessor) Events() <-chan pclient.Event             { return c.events }

type fakeSynth struct {
	results    chan protocol.SynthesizerResult
	events     chan pclient.Event
	onResult   func(protocol.ProcessorResult)
	lastResult protocol.ProcessorResult
}

func (c *fakeSynth) SendResult(_ context.Context, value protocol.ProcessorResult) error {
	c.lastResult = value
	c.onResult(value)
	return nil
}
func (c *fakeSynth) Results() <-chan protocol.SynthesizerResult { return c.results }
func (c *fakeSynth) Events() <-chan pclient.Event               { return c.events }
