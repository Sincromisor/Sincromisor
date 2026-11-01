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
	voice := receiveSynthesis(t, coordinator)
	if user.Generation != 1 || assistant.Generation != 1 || voice.Generation != 1 {
		t.Fatalf("outputs used wrong generation: user=%d assistant=%d voice=%d",
			user.Generation, assistant.Generation, voice.Generation)
	}
	if user.Value.Message != "fixture recognized" || assistant.Value.Message != "fixture response" {
		t.Fatalf("unexpected text outputs: user=%q assistant=%q", user.Value.Message, assistant.Value.Message)
	}
	if len(voice.Value.PCM) != 9600 || voice.Value.RequestID != 1 {
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

func TestCoordinatorOnlySendsConfirmedRecognitionToProcessor(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-partial", "sincro"); err != nil {
		t.Fatal(err)
	}
	defer coordinator.Close()
	set := factory.setAt(t, 0)
	requests := make(chan protocol.ProcessorRequest, 8)
	set.processor.onRequest = func(request protocol.ProcessorRequest) { requests <- request }
	set.extractor.onPCM = func(frame []byte) {
		sequence := int64(frame[0])
		set.extractor.results <- protocol.ExtractorResult{
			SessionID: "session-partial", SpeechID: 1, SequenceID: sequence, Confirmed: sequence == 4,
			Voice: []byte{}, VoiceDType: "int16", VoiceSamplingRate: 16000, VoiceSampleBytes: 2, VoiceChannels: 1,
		}
	}
	var messageID string
	for sequence := byte(1); sequence <= 4; sequence++ {
		frame := make([]byte, pcmFrameBytes)
		frame[0] = sequence
		if err := coordinator.SubmitPCM(frame); err != nil {
			t.Fatal(err)
		}
		message := receive(t, coordinator.TextResults()).Value
		if messageID == "" {
			messageID = message.MessageID
		}
		if message.MessageID != messageID {
			t.Fatal("partial message identity changed")
		}
	}
	request := receive(t, requests)
	if !request.Confirmed || request.SequenceID != 4 || len(request.History.Messages) != 1 {
		t.Fatalf("processor received an unexpected request: %+v", request)
	}
	// 確定要求の送信を同期点にし、それ以前の全暫定処理の完了を保証する。
	coordinator.mu.Lock()
	conv := coordinator.work.conv
	coordinator.mu.Unlock()
	conv.mu.Lock()
	defer conv.mu.Unlock()
	if len(conv.requests) != 1 || len(conv.outstanding) != 0 {
		t.Fatalf("retained requests=%d extractions=%d", len(conv.requests), len(conv.outstanding))
	}
	select {
	case extra := <-requests:
		t.Fatalf("unexpected extra processor request: %+v", extra)
	default:
	}
}

func TestCoordinatorForwardsEachExtractorPartialWhenRecognitionKeepsUp(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-partials", "sincro"); err != nil {
		t.Fatal(err)
	}
	defer coordinator.Close()
	set := factory.setAt(t, 0)
	forwarded := make(chan protocol.ExtractorResult, 3)
	set.recognizer.onExtraction = func(value protocol.ExtractorResult) { forwarded <- value }
	for sequence := int64(1); sequence <= 3; sequence++ {
		want := []byte{byte(sequence), 0}
		set.extractor.results <- extractionForTest("session-partials", 1, sequence, sequence == 3, want)
		got := receive(t, forwarded)
		if !bytes.Equal(got.Voice, want) || got.Confirmed != (sequence == 3) {
			t.Fatalf("partial %d was changed", sequence)
		}
		set.recognizer.results <- recognitionForTest(got)
		receive(t, coordinator.TextResults())
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
	first := extractionForTest("session", 10, 1, true, []byte{})
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
	next := extractionForTest("session", 11, 2, false, []byte{})
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
