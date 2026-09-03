package datachannel

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestDataChannelQueueOverflowPolicies(t *testing.T) {
	dispatcher := newDispatcherForTest(t, func(error) {})
	message := protocol.ChatMessage{MessageID: "id", Message: "text"}
	for index := 0; index < textQueueCapacity; index++ {
		if err := dispatcher.EnqueueText(message); err != nil {
			t.Fatalf("EnqueueText(%d) error = %v", index, err)
		}
	}
	if err := dispatcher.EnqueueText(message); !errors.Is(err, ErrTextQueueFull) {
		t.Fatalf("text overflow error = %v, want ErrTextQueueFull", err)
	}
	if len(dispatcher.textQueue) != textQueueCapacity {
		t.Fatalf("text queue length = %d", len(dispatcher.textQueue))
	}

	for index := 0; index <= telopQueueCapacity; index++ {
		if err := dispatcher.EnqueueTelop(audiomedia.TelopPayload{SpeechID: int64(index)}); err != nil {
			t.Fatalf("EnqueueTelop(%d) error = %v", index, err)
		}
	}
	if len(dispatcher.telopQueue) != telopQueueCapacity {
		t.Fatalf("telop queue length = %d", len(dispatcher.telopQueue))
	}
	var oldest audiomedia.TelopPayload
	if err := json.Unmarshal(dispatcher.telopQueue[0], &oldest); err != nil {
		t.Fatalf("decode oldest telop: %v", err)
	}
	if oldest.SpeechID != 1 {
		t.Fatalf("oldest retained speech_id = %d, want 1", oldest.SpeechID)
	}
}

func TestDataChannelTextJSONSchemaAndSizeBoundary(t *testing.T) {
	zero := int64(0)
	payload, err := marshalDataChannelPayload(chatMessagePayload{
		SpeechID: 1, MessageID: "m", MessageType: "assistant",
		SpeakerID: "s", SpeakerName: "name", ExpressionCode: &zero,
		Message: "body", CreatedAt: 1.5,
	})
	if err != nil {
		t.Fatalf("marshalDataChannelPayload() error = %v", err)
	}
	got := string(payload)
	for _, field := range []string{
		`"speech_id":1`, `"message_id":"m"`, `"message_type":"assistant"`,
		`"speaker_id":"s"`, `"speaker_name":"name"`, `"expression_code":0`,
		`"message":"body"`, `"created_at":1.5`,
	} {
		if !strings.Contains(got, field) {
			t.Fatalf("payload %s lacks %s", got, field)
		}
	}
	nilPayload, err := marshalDataChannelPayload(chatMessagePayload{})
	if err != nil {
		t.Fatalf("marshal nil expression: %v", err)
	}
	if strings.Contains(string(nilPayload), "expression_code") {
		t.Fatalf("nil expression_code was not omitted: %s", nilPayload)
	}

	base, err := marshalDataChannelPayload(map[string]string{"message": ""})
	if err != nil {
		t.Fatalf("marshal base: %v", err)
	}
	exactMessage := strings.Repeat("a", dataChannelPayloadLimit-len(base))
	exact, err := marshalDataChannelPayload(map[string]string{"message": exactMessage})
	if err != nil || len(exact) != dataChannelPayloadLimit {
		t.Fatalf("exact payload = %d, %v", len(exact), err)
	}
	_, err = marshalDataChannelPayload(map[string]string{"message": exactMessage + "a"})
	if !errors.Is(err, ErrDataChannelPayloadTooLarge) {
		t.Fatalf("oversize error = %v", err)
	}
}
