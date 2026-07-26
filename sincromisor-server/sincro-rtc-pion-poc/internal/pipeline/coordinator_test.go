package pipeline

import (
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

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
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
		if got := (<-queue.values)[0]; got != 1 {
			t.Fatalf("oldest retained frame = %d, want 1", got)
		}
		if queue.drops != 1 {
			t.Fatalf("drop count = %d, want 1", queue.drops)
		}
		var caps []time.Duration
		coordinator, err := newCoordinatorWithHooks(
			&fakeFactory{t: t}, slog.New(slog.NewTextHandler(io.Discard, nil)),
			func(cap time.Duration) (time.Duration, error) {
				caps = append(caps, cap)
				return 0, nil
			},
			func(context.Context, time.Duration) error { return nil },
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

func newTestCoordinator(t *testing.T, factory ClientSetFactory) *Coordinator {
	t.Helper()
	coordinator, err := newCoordinatorWithHooks(
		factory, slog.New(slog.NewTextHandler(io.Discard, nil)),
		func(time.Duration) (time.Duration, error) { return 0, nil },
		func(ctx context.Context, _ time.Duration) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
				return nil
			}
		},
	)
	if err != nil {
		t.Fatalf("newCoordinatorWithHooks() error = %v", err)
	}
	return coordinator
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
	if _, ok := <-coordinator.TextResults(); ok {
		t.Fatal("text output remained open after Close")
	}
	if _, ok := <-coordinator.SynthResults(); ok {
		t.Fatal("synth output remained open after Close")
	}
}

type fakeFactory struct {
	t    *testing.T
	mu   sync.Mutex
	sets []*fakeSet
}

func (f *fakeFactory) Connect(_ context.Context, sessionID, _ string) (ClientSet, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	set := newFakeSet(f.t, sessionID, len(f.sets)+1)
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

func newFakeSet(t *testing.T, sessionID string, speechID int) *fakeSet {
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
		fixture.SessionID, fixture.SpeechID, fixture.SequenceID = sessionID, int64(speechID), int64(speechID)
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
