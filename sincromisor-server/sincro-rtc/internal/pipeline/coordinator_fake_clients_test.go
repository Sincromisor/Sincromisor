package pipeline

import (
	"context"
	"os"
	"sync"
	"testing"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

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
