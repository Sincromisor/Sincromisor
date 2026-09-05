package pipeline

import (
	"bytes"
	"context"
	"testing"

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
	if _, _, err := conv.validateProcessor(intermediate); err == nil {
		t.Fatal("intermediate result after final was accepted")
	}
	if len(conv.requests) != 0 {
		t.Fatal("completed request was retained")
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
	regressed.SpeechID = first.SpeechID
	if _, err := conv.acceptExtraction(regressed); err == nil {
		t.Fatal("acceptExtraction() reused a completed speech ID")
	}
	next := protocol.ExtractorResult{SessionID: "session", SpeechID: 11, SequenceID: 2}
	if _, err := conv.acceptExtraction(next); err != nil {
		t.Fatalf("next partial extraction error = %v", err)
	}
	regressed.SequenceID = 3
	if _, err := conv.acceptExtraction(regressed); err == nil {
		t.Fatal("acceptExtraction() accepted a completed speech during another speech")
	}
	next.SequenceID, next.Confirmed = 3, true
	if _, err := conv.acceptExtraction(next); err != nil {
		t.Fatalf("next confirmed extraction error = %v", err)
	}
}
