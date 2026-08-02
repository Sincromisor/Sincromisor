package rtc

import (
	"encoding/json"
	"fmt"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

type chatMessagePayload struct {
	SpeechID       int64   `json:"speech_id"`
	MessageID      string  `json:"message_id"`
	MessageType    string  `json:"message_type"`
	SpeakerID      string  `json:"speaker_id"`
	SpeakerName    string  `json:"speaker_name"`
	ExpressionCode *int64  `json:"expression_code,omitempty"`
	Message        string  `json:"message"`
	CreatedAt      float64 `json:"created_at"`
}

// EnqueueText はpipeline ChatMessageを明示的なFrontend JSON schemaへ変換してFIFOへ加える。
//
// ExpressionCodeのnilはfield欠落、zeroは保持する。payloadはUTF-8 JSON textとして64 KiB以下に制限する。
func (d *DataChannelDispatcher) EnqueueText(message protocol.ChatMessage) error {
	payload, err := marshalDataChannelPayload(chatMessagePayload{
		SpeechID:       message.SpeechID,
		MessageID:      message.MessageID,
		MessageType:    message.MessageType,
		SpeakerID:      message.SpeakerID,
		SpeakerName:    message.SpeakerName,
		ExpressionCode: message.ExpressionCode,
		Message:        message.Message,
		CreatedAt:      message.CreatedAt,
	})
	if err != nil {
		return err
	}
	d.mu.Lock()
	if len(d.textQueue) == textQueueCapacity {
		d.mu.Unlock()
		count := d.textRejected.Add(1)
		d.logger.Warn("rejected data channel event",
			"queue", "text", "action", "reject_incoming", "count", count,
		)
		return ErrTextQueueFull
	}
	d.textQueue = append(d.textQueue, payload)
	d.mu.Unlock()
	signal(d.textWake)
	return nil
}

// EnqueueTelop はaudio tickと同期済みtelopをunordered queueへ加える。
//
// queue満杯時は最古の未送信eventだけをdropし、incomingを保持してsessionを継続する。
func (d *DataChannelDispatcher) EnqueueTelop(event audiomedia.TelopPayload) error {
	payload, err := marshalDataChannelPayload(event)
	if err != nil {
		return err
	}
	d.mu.Lock()
	if len(d.telopQueue) == telopQueueCapacity {
		copy(d.telopQueue, d.telopQueue[1:])
		d.telopQueue = d.telopQueue[:len(d.telopQueue)-1]
		count := d.telopDropped.Add(1)
		d.logger.Warn("dropped data channel event",
			"queue", "telop", "action", "drop_oldest", "count", count,
		)
	}
	d.telopQueue = append(d.telopQueue, payload)
	d.mu.Unlock()
	signal(d.telopWake)
	return nil
}

func marshalDataChannelPayload(value any) ([]byte, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal data channel payload: %w", err)
	}
	if len(payload) > dataChannelPayloadLimit {
		return nil, ErrDataChannelPayloadTooLarge
	}
	return payload, nil
}
