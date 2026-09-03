package protocol

import (
	"testing"

	"github.com/vmihailenco/msgpack/v5"
)

// mustPack は各境界のMap入力を本番と同じMessagePack表現へ変換する。
func mustPack(t *testing.T, value any) []byte {
	t.Helper()
	payload, err := msgpack.Marshal(value)
	if err != nil {
		t.Fatalf("msgpack.Marshal() error = %v", err)
	}
	return payload
}

func extractorError(payload []byte) error {
	_, err := DecodeExtractorResult(payload)
	return err
}

func recognizerError(payload []byte) error {
	_, err := DecodeRecognizerResult(payload)
	return err
}

func processorError(payload []byte) error {
	_, err := DecodeProcessorResult(payload)
	return err
}

func synthesizerError(payload []byte) error {
	_, err := DecodeSynthesizerResult(payload)
	return err
}

func extractorMap() map[string]any {
	return map[string]any{
		"session_id":          "fixture-session",
		"speech_id":           int64(42),
		"sequence_id":         int64(7),
		"start_at":            1_700_000_000.5,
		"confirmed":           true,
		"voice":               []byte{0, 1},
		"voice_dtype":         "int16",
		"voice_sampling_rate": int64(16_000),
		"voice_sample_bytes":  int64(2),
		"voice_channels":      int64(1),
	}
}

func recognizerMap() map[string]any {
	return map[string]any{
		"session_id":  "fixture-session",
		"speech_id":   int64(42),
		"sequence_id": int64(7),
		"start_at":    1_700_000_000.5,
		"confirmed":   true,
		"result":      []any{[]any{"text", 0.5}},
	}
}

func chatMessageMap() map[string]any {
	return map[string]any{
		"speech_id":       int64(42),
		"message_id":      "01J00000000000000000000001",
		"message_type":    "user",
		"speaker_id":      "fixture-user",
		"speaker_name":    "利用者",
		"expression_code": nil,
		"message":         "fixed",
		"created_at":      1_700_000_001.25,
	}
}

func processorResultMap() map[string]any {
	return map[string]any{
		"session_id":       "fixture-session",
		"sequence_id":      int64(7),
		"confirmed":        true,
		"history":          map[string]any{"messages": []any{chatMessageMap()}},
		"request_message":  chatMessageMap(),
		"response_message": chatMessageMap(),
		"end_of_response":  false,
		"voice_text":       nil,
	}
}

func synthesizerMap() map[string]any {
	return map[string]any{
		"speech_id":     int64(42),
		"message":       "fixed",
		"query":         map[string]any{"unknown_query_field": true},
		"mora_queue":    []any{map[string]any{"vowel": nil, "length": 0.25, "text": nil}},
		"speaking_time": 0.25,
		"voice":         []byte{0, 1},
		"audio_format":  "audio/wav",
	}
}

func cloneMap(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func withValue(source map[string]any, key string, value any) map[string]any {
	result := cloneMap(source)
	result[key] = value
	return result
}

func withoutKey(source map[string]any, key string) map[string]any {
	result := cloneMap(source)
	delete(result, key)
	return result
}

func processorWithoutNestedKey(source map[string]any, parentKey, nestedKey string) map[string]any {
	result := cloneMap(source)
	nested := cloneMap(source[parentKey].(map[string]any))
	delete(nested, nestedKey)
	result[parentKey] = nested
	return result
}
