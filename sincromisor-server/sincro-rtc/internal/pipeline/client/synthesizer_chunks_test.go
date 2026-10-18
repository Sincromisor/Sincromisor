package client

import (
	"context"
	"errors"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
	"github.com/vmihailenco/msgpack/v5"
)

func TestSynthesisRequestsMatchIdentityUntilExplicitCompletion(t *testing.T) {
	requests := &synthesisRequests{}
	if err := requests.add(42); err != nil {
		t.Fatal(err)
	}
	if err := requests.add(42); err != nil {
		t.Fatal(err)
	}
	first, err := requests.decode(fixture(t, "voice_synthesizer_chunk.msgpack"))
	if err != nil || len(requests.pending) != 2 {
		t.Fatalf("initial decode: %v, pending=%d", err, len(requests.pending))
	}
	final := protocol.SynthesizerChunk{RequestID: 1, SpeechID: 42, Sequence: 1, SampleOffset: int64(len(first.PCM) / 2), Final: true, PCM: []byte{}, MoraQueue: []protocol.SynthesizerMora{}}
	final.SpeechID = 43
	payload, _ := msgpack.Marshal(final)
	if _, err := requests.decode(payload); err == nil {
		t.Fatal("another speech accepted")
	}
	final.SpeechID = 42
	payload, _ = msgpack.Marshal(final)
	if _, err := requests.decode(payload); err != nil {
		t.Fatal(err)
	}
	if len(requests.pending) != 1 {
		t.Fatal("completed request not removed")
	}
	if _, err := requests.decode(payload); err == nil {
		t.Fatal("duplicate completed request accepted")
	}
	first.RequestID = 2
	payload, _ = msgpack.Marshal(first)
	if _, err := requests.decode(payload); err != nil {
		t.Fatal(err)
	}
}

func TestSynthesisRequestsBoundPendingCount(t *testing.T) {
	requests := &synthesisRequests{}
	for range 8 {
		if err := requests.add(42); err != nil {
			t.Fatal(err)
		}
	}
	if err := requests.add(42); err == nil {
		t.Fatal("unbounded pending synthesis requests")
	}
}

func TestSynthesisSendBeforeConnectDoesNotReserveRequestID(t *testing.T) {
	client, err := NewSynthesizer(testConfig("chat"), fakeResolver{}, testLogger())
	if err != nil {
		t.Fatal(err)
	}
	processor := processorResultWithPadding(t, 0)
	if err := client.SendResult(context.Background(), processor); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("SendResult = %v", err)
	}
	if client.requests.sent != 0 || len(client.requests.pending) != 0 {
		t.Fatal("failed send reserved synthesis identity")
	}
	_ = client.Close()
}

func TestSynthesisSendRejectsEmptyVoiceTextBeforeReservingIdentity(t *testing.T) {
	client, err := NewSynthesizer(testConfig("chat"), fakeResolver{}, testLogger())
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := msgpack.Unmarshal(fixture(t, "text_processor_result.msgpack"), &fields); err != nil {
		t.Fatal(err)
	}
	for _, text := range []any{nil, ""} {
		fields["voice_text"] = text
		payload, _ := msgpack.Marshal(fields)
		processor, err := protocol.DecodeProcessorResult(payload)
		if err != nil {
			t.Fatal(err)
		}
		if err := client.SendResult(context.Background(), processor); err == nil || errors.Is(err, ErrNotConnected) {
			t.Fatalf("empty voice text not validated: %v", err)
		}
	}
	if client.requests.sent != 0 {
		t.Fatal("empty voice text reserved request")
	}
	_ = client.Close()
}
