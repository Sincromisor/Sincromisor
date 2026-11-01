package pipeline

import (
	"bytes"
	"context"
	"errors"
	"testing"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func extractionForTest(session string, speech, sequence int64, confirmed bool, pcm []byte) protocol.ExtractorResult {
	return protocol.ExtractorResult{SessionID: session, SpeechID: speech, SequenceID: sequence,
		Confirmed: confirmed, Voice: pcm, VoiceDType: "int16", VoiceSamplingRate: 16000,
		VoiceSampleBytes: 2, VoiceChannels: 1}
}

func recognitionForTest(value protocol.ExtractorResult) protocol.RecognizerResult {
	return protocol.RecognizerResult{SessionID: value.SessionID, SpeechID: value.SpeechID,
		SequenceID: value.SequenceID, Confirmed: value.Confirmed, Result: []protocol.RecognitionToken{}}
}

func TestRecognitionCoalescesOnlyUnsentAudioAndPreservesUtterances(t *testing.T) {
	factory := &fakeFactory{t: t}
	c := newTestCoordinator(t, factory)
	if err := c.Start(context.Background(), "session", "chat"); err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	set := factory.setAt(t, 0)
	sent := make(chan protocol.ExtractorResult, 8)
	set.recognizer.onExtraction = func(value protocol.ExtractorResult) { sent <- value }
	c.mu.Lock()
	work := c.work
	c.mu.Unlock()
	var original []byte
	submit := func(speech, sequence int64, confirmed bool) {
		pcm := []byte{byte(sequence), 0}
		original = append(original, pcm...)
		set.extractor.results <- extractionForTest("session", speech, sequence, confirmed, pcm)
		waitFor(t, func() bool { work.conv.mu.Lock(); defer work.conv.mu.Unlock(); return work.conv.sequence == sequence })
	}
	submit(1, 1, false)
	first := receive(t, sent)
	submit(1, 2, false)
	submit(1, 3, false)
	submit(1, 4, true)
	submit(2, 5, false)
	submit(2, 6, true)
	work.conv.mu.Lock()
	outstanding, pending := len(work.conv.outstanding), len(work.conv.pending)
	work.conv.mu.Unlock()
	if outstanding != 1 || pending != 2 {
		t.Fatalf("queued/flight state = %d/%d, want 2/1", pending, outstanding)
	}
	select {
	case <-sent:
		t.Fatal("sent a second request before receiving a result")
	default:
	}
	set.recognizer.results <- recognitionForTest(first)
	second := receive(t, sent)
	if second.SequenceID != 4 || !second.Confirmed || second.SpeechID != 1 {
		t.Fatalf("first utterance confirmation differs: %+v", second)
	}
	set.recognizer.results <- recognitionForTest(second)
	third := receive(t, sent)
	if third.SequenceID != 6 || !third.Confirmed || third.SpeechID != 2 {
		t.Fatalf("next utterance was mixed: %+v", third)
	}
	set.recognizer.results <- recognitionForTest(third)
	joined := append(append(bytes.Clone(first.Voice), second.Voice...), third.Voice...)
	if !bytes.Equal(joined, original) {
		t.Fatal("PCM was duplicated, lost or reordered")
	}
	waitFor(t, func() bool {
		work.conv.mu.Lock()
		defer work.conv.mu.Unlock()
		return len(work.conv.outstanding) == 0
	})
	work.conv.mu.Lock()
	defer work.conv.mu.Unlock()
	if len(work.conv.outstanding) != 0 || len(work.conv.pending) != 0 || work.conv.pendingBytes != 0 {
		t.Fatal("completed audio was retained")
	}
}

func TestRecognitionNextSendDoesNotWaitForTextConsumer(t *testing.T) {
	factory := &fakeFactory{t: t}
	c := newTestCoordinator(t, factory)
	if err := c.Start(context.Background(), "session", "chat"); err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	set := factory.setAt(t, 0)
	sent := make(chan protocol.ExtractorResult, 2)
	set.recognizer.onExtraction = func(value protocol.ExtractorResult) { sent <- value }
	for range outputQueueCapacity {
		c.textOut <- Output[protocol.ChatMessage]{}
	}
	set.extractor.results <- extractionForTest("session", 1, 1, false, []byte{1, 0})
	first := receive(t, sent)
	set.extractor.results <- extractionForTest("session", 1, 2, true, []byte{2, 0})
	set.recognizer.results <- recognitionForTest(first)
	if second := receive(t, sent); second.SequenceID != 2 {
		t.Fatal("next request was not sent")
	}
}

func TestRecognitionRejectsUnsentAndDuplicateResults(t *testing.T) {
	c := newConversation("session")
	first := extractionForTest("session", 1, 1, false, []byte{1, 0})
	if _, err := c.acceptExtraction(first); err != nil {
		t.Fatal(err)
	}
	if _, err := c.acceptRecognition(recognitionForTest(first)); err == nil {
		t.Fatal("accepted unsent result")
	}
	item, _, ok := c.nextRecognition()
	if !ok {
		t.Fatal("first request missing")
	}
	if _, err := c.acceptRecognition(recognitionForTest(item.value)); err != nil {
		t.Fatal(err)
	}
	if _, err := c.acceptRecognition(recognitionForTest(item.value)); err == nil {
		t.Fatal("accepted duplicate result")
	}
}

func TestRecognitionPendingLimitsAndFormat(t *testing.T) {
	for _, kind := range []string{"request_bytes", "total_bytes", "count", "format", "odd_pcm"} {
		t.Run(kind, func(t *testing.T) {
			c := newConversation("session")
			value := extractionForTest("session", 1, 1, true, []byte{1, 0})
			switch kind {
			case "request_bytes":
				value.Voice = make([]byte, recognitionRequestPCMBytes+2)
			case "total_bytes":
				previous := value
				previous.Voice = make([]byte, recognitionRequestPCMBytes)
				if _, err := c.acceptExtraction(previous); err != nil {
					t.Fatal(err)
				}
				value.SpeechID, value.SequenceID, value.Voice = 2, 2, make([]byte, 4098)
			case "count":
				for i := int64(1); i <= recognitionPendingCapacity; i++ {
					if _, err := c.acceptExtraction(extractionForTest("session", i, i, true, []byte{})); err != nil {
						t.Fatal(err)
					}
				}
				value.SpeechID, value.SequenceID = 17, 17
			case "format":
				value.VoiceSamplingRate = 48000
			case "odd_pcm":
				value.Voice = []byte{1}
			}
			if _, err := c.acceptExtraction(value); err == nil {
				t.Fatal("invalid or oversized input accepted")
			}
			c.clearRecognition()
			if c.pendingBytes != 0 || len(c.pending) != 0 || len(c.outstanding) != 0 {
				t.Fatal("pending input was retained after clear")
			}
		})
	}
}

func TestRecognitionGenerationEndReleasesPendingAndInFlight(t *testing.T) {
	for _, outcome := range []string{"reset", "close", "overflow", "send_failure"} {
		t.Run(outcome, func(t *testing.T) {
			factory := &fakeFactory{t: t}
			c := newTestCoordinator(t, factory)
			if err := c.Start(context.Background(), "session", "chat"); err != nil {
				t.Fatal(err)
			}
			defer c.Close()
			set := factory.setAt(t, 0)
			sent := make(chan protocol.ExtractorResult, 1)
			set.recognizer.onExtraction = func(value protocol.ExtractorResult) { sent <- value }
			c.mu.Lock()
			old := c.work
			c.mu.Unlock()
			set.extractor.results <- extractionForTest("session", 1, 1, false, []byte{1, 0})
			first := receive(t, sent)
			set.extractor.results <- extractionForTest("session", 1, 2, true, []byte{2, 0})
			waitFor(t, func() bool { old.conv.mu.Lock(); defer old.conv.mu.Unlock(); return old.conv.sequence == 2 })
			switch outcome {
			case "reset":
				set.emit(pclient.Event{Service: pclient.ServiceRecognizer, Kind: pclient.EventReadFailed})
			case "close":
				if err := c.Close(); err != nil {
					t.Fatal(err)
				}
			case "overflow":
				set.extractor.results <- extractionForTest("session", 2, 3, true, make([]byte, recognitionRequestPCMBytes+2))
			case "send_failure":
				set.recognizer.sendError = errors.New("failed")
				set.recognizer.results <- recognitionForTest(first)
			}
			if outcome != "close" {
				waitFor(t, func() bool { return factory.count() == 2 })
			}
			old.conv.mu.Lock()
			defer old.conv.mu.Unlock()
			if old.conv.pendingBytes != 0 || len(old.conv.pending) != 0 || len(old.conv.outstanding) != 0 {
				t.Fatal("old generation retained audio")
			}
		})
	}
}
