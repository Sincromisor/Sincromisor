package protocol

import (
	"bytes"
	"math"
	"os"
	"strings"
	"testing"

	"github.com/vmihailenco/msgpack/v5"
)

func TestPythonGoldenFixturesDecodeWithProductionCodecs(t *testing.T) {
	t.Run("extractor result", func(t *testing.T) {
		payload := readFixture(t, "extractor_result.msgpack")
		result, err := DecodeExtractorResult(payload)
		if err != nil {
			t.Fatalf("DecodeExtractorResult() error = %v", err)
		}
		if result.SessionID != "fixture-session" || result.SpeechID != 42 || result.SequenceID != 7 {
			t.Fatalf("unexpected routing fields: %+v", result)
		}
		if result.StartAt != 1_700_000_000.5 || !result.Confirmed {
			t.Fatalf("unexpected timing/status: %+v", result)
		}
		expectedVoice := []byte{0x00, 0x80, 0xff, 0xff, 0x00, 0x00, 0x01, 0x00, 0xff, 0x7f}
		if !bytes.Equal(result.Voice, expectedVoice) {
			t.Fatalf("Voice = %x, want %x", result.Voice, expectedVoice)
		}
		if result.VoiceDType != "int16" || result.VoiceSamplingRate != 16_000 ||
			result.VoiceSampleBytes != 2 || result.VoiceChannels != 1 {
			t.Fatalf("unexpected voice metadata: %+v", result)
		}
	})

	t.Run("recognizer result", func(t *testing.T) {
		result, err := DecodeRecognizerResult(readFixture(t, "recognizer_result.msgpack"))
		if err != nil {
			t.Fatalf("DecodeRecognizerResult() error = %v", err)
		}
		expected := []RecognitionToken{{Text: "固定", Score: 0.875}, {Text: "文", Score: 0.5}}
		if len(result.Result) != len(expected) {
			t.Fatalf("len(Result) = %d, want %d", len(result.Result), len(expected))
		}
		for index := range expected {
			if result.Result[index] != expected[index] {
				t.Fatalf("Result[%d] = %+v, want %+v", index, result.Result[index], expected[index])
			}
		}
	})

	t.Run("processor result", func(t *testing.T) {
		payload := readFixture(t, "text_processor_result.msgpack")
		result, err := DecodeProcessorResult(payload)
		if err != nil {
			t.Fatalf("DecodeProcessorResult() error = %v", err)
		}
		if result.VoiceText != nil {
			t.Fatalf("VoiceText = %q, want nil", *result.VoiceText)
		}
		if result.RequestMessage.ExpressionCode != nil {
			t.Fatalf("request ExpressionCode = %v, want nil", *result.RequestMessage.ExpressionCode)
		}
		if result.ResponseMessage.ExpressionCode == nil || *result.ResponseMessage.ExpressionCode != 4 {
			t.Fatalf("response ExpressionCode = %v, want 4", result.ResponseMessage.ExpressionCode)
		}
		if len(result.History.Messages) != 1 || result.History.Messages[0].Message != "固定された認識文" {
			t.Fatalf("unexpected nested history: %+v", result.History)
		}
		if !bytes.Equal(result.Raw, payload) {
			t.Fatal("Raw does not preserve the received MessagePack bytes")
		}
	})

	t.Run("synthesizer result", func(t *testing.T) {
		result, err := DecodeSynthesizerResult(readFixture(t, "voice_synthesizer_result.msgpack"))
		if err != nil {
			t.Fatalf("DecodeSynthesizerResult() error = %v", err)
		}
		if result.SpeechID != 42 || result.Message != "固定された応答文" ||
			result.SpeakingTime != 0.1 || result.AudioFormat != "audio/ogg;codecs=opus" {
			t.Fatalf("unexpected synthesizer fields: %+v", result)
		}
		wantVoice, err := os.ReadFile("../../media/synthdecode/testdata/tone-opus.ogg")
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(result.Voice, wantVoice) || !bytes.HasPrefix(result.Voice, []byte("OggS")) {
			t.Fatalf("Voice is not the Ogg/Opus fixture")
		}
		if len(result.MoraQueue) != 2 || result.MoraQueue[0].Vowel == nil ||
			*result.MoraQueue[0].Vowel != "o" || result.MoraQueue[0].Length != 0.05 || result.MoraQueue[1].Length != 0.05 || result.MoraQueue[1].Vowel != nil ||
			result.MoraQueue[1].Text != nil {
			t.Fatalf("unexpected mora queue: %+v", result.MoraQueue)
		}
	})
}

func TestDecodeRejectsMalformedPayloadsWithStablePaths(t *testing.T) {
	validExtractor := extractorMap()
	validRecognizer := recognizerMap()
	validProcessor := processorResultMap()
	validSynthesizer := synthesizerMap()

	tests := []struct {
		name      string
		payload   []byte
		decode    func([]byte) error
		wantParts []string
	}{
		{
			name:      "empty payload",
			payload:   nil,
			decode:    extractorError,
			wantParts: []string{"ExtractorResult", "$", "empty payload"},
		},
		{
			name:      "top level is not map",
			payload:   mustPack(t, []any{"not", "map"}),
			decode:    extractorError,
			wantParts: []string{"ExtractorResult", "$", "expected map"},
		},
		{
			name:      "top level key is not string",
			payload:   mustPack(t, map[any]any{1: "value"}),
			decode:    extractorError,
			wantParts: []string{"ExtractorResult", "$", "decode MessagePack"},
		},
		{
			name:      "trailing object",
			payload:   append(mustPack(t, validExtractor), mustPack(t, true)...),
			decode:    extractorError,
			wantParts: []string{"ExtractorResult", "$", "trailing"},
		},
		{
			name:    "missing required field",
			payload: mustPack(t, withoutKey(validExtractor, "session_id")),
			decode:  extractorError,
			wantParts: []string{
				"ExtractorResult", "ExtractorResult.session_id", "missing required field",
			},
		},
		{
			name:    "wrong field type does not expose value",
			payload: mustPack(t, withValue(validExtractor, "session_id", "secret-payload-value")),
			decode: func(payload []byte) error {
				root := cloneMap(validExtractor)
				root["speech_id"] = "secret-payload-value"
				return extractorError(mustPack(t, root))
			},
			wantParts: []string{"ExtractorResult", "ExtractorResult.speech_id", "expected integer"},
		},
		{
			name:      "voice text is rejected",
			payload:   mustPack(t, withValue(validExtractor, "voice", "not-binary")),
			decode:    extractorError,
			wantParts: []string{"ExtractorResult", "ExtractorResult.voice", "expected binary"},
		},
		{
			name:    "recognizer tuple has wrong length",
			payload: mustPack(t, withValue(validRecognizer, "result", []any{[]any{"text"}})),
			decode:  recognizerError,
			wantParts: []string{
				"RecognizerResult", "RecognizerResult.result[0]", "expected [text, score]",
			},
		},
		{
			name:    "recognizer tuple score is not float",
			payload: mustPack(t, withValue(validRecognizer, "result", []any{[]any{"text", int64(1)}})),
			decode:  recognizerError,
			wantParts: []string{
				"RecognizerResult", "RecognizerResult.result[0][1]", "expected float",
			},
		},
		{
			name:      "recognizer nil list",
			payload:   mustPack(t, withValue(validRecognizer, "result", nil)),
			decode:    recognizerError,
			wantParts: []string{"RecognizerResult", "RecognizerResult.result", "expected list"},
		},
		{
			name:    "nested required field",
			payload: mustPack(t, processorWithoutNestedKey(validProcessor, "response_message", "speech_id")),
			decode:  processorError,
			wantParts: []string{
				"ProcessorResult", "ProcessorResult.response_message.speech_id", "missing required field",
			},
		},
		{
			name:      "synthesizer query nil",
			payload:   mustPack(t, withValue(validSynthesizer, "query", nil)),
			decode:    synthesizerError,
			wantParts: []string{"SynthesizerResult", "SynthesizerResult.query", "expected map"},
		},
		{
			name:      "integer exceeds int64",
			payload:   mustPack(t, withValue(validSynthesizer, "speech_id", uint64(math.MaxInt64)+1)),
			decode:    synthesizerError,
			wantParts: []string{"SynthesizerResult", "SynthesizerResult.speech_id", "int64 range"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.decode(test.payload)
			if err == nil {
				t.Fatal("decode succeeded, want error")
			}
			for _, part := range test.wantParts {
				if !strings.Contains(err.Error(), part) {
					t.Fatalf("error %q does not contain %q", err, part)
				}
			}
			if strings.Contains(err.Error(), "secret-payload-value") {
				t.Fatalf("error exposes payload value: %v", err)
			}
		})
	}
}

func TestDecodeAllowsUnknownFieldsAndEmptyCollections(t *testing.T) {
	processor := processorResultMap()
	processor["future"] = map[string]any{"nested_future": []any{int64(1), "two"}}
	response := processor["response_message"].(map[string]any)
	response["future_nested"] = map[string]any{"enabled": true}
	if _, err := DecodeProcessorResult(mustPack(t, processor)); err != nil {
		t.Fatalf("DecodeProcessorResult() with unknown fields error = %v", err)
	}

	recognizer := recognizerMap()
	recognizer["result"] = []any{}
	result, err := DecodeRecognizerResult(mustPack(t, recognizer))
	if err != nil {
		t.Fatalf("DecodeRecognizerResult() empty list error = %v", err)
	}
	if result.Result == nil || len(result.Result) != 0 {
		t.Fatalf("Result = %#v, want owned empty list", result.Result)
	}

	extractor := extractorMap()
	extractor["voice"] = []byte{}
	extracted, err := DecodeExtractorResult(mustPack(t, extractor))
	if err != nil {
		t.Fatalf("DecodeExtractorResult() empty binary error = %v", err)
	}
	if extracted.Voice == nil || len(extracted.Voice) != 0 {
		t.Fatalf("Voice = %#v, want owned empty binary", extracted.Voice)
	}
}

func TestDecodeReturnsDefensiveCopies(t *testing.T) {
	processorPayload := mustPack(t, processorResultMap())
	processor, err := DecodeProcessorResult(processorPayload)
	if err != nil {
		t.Fatalf("DecodeProcessorResult() error = %v", err)
	}
	processorSnapshot := bytes.Clone(processor.Raw)
	processorPayload[0] ^= 0xff
	if !bytes.Equal(processor.Raw, processorSnapshot) {
		t.Fatal("ProcessorResult.Raw aliases input payload")
	}

	extractorPayload := mustPack(t, extractorMap())
	extractor, err := DecodeExtractorResult(extractorPayload)
	if err != nil {
		t.Fatalf("DecodeExtractorResult() error = %v", err)
	}
	voiceSnapshot := bytes.Clone(extractor.Voice)
	for index := range extractorPayload {
		extractorPayload[index] = 0
	}
	if !bytes.Equal(extractor.Voice, voiceSnapshot) {
		t.Fatal("ExtractorResult.Voice aliases input payload")
	}
}

func TestEncodeRejectsNilRequiredCollections(t *testing.T) {
	if _, err := EncodeExtractorResult(ExtractorResult{}); err == nil ||
		!strings.Contains(err.Error(), "ExtractorResult.voice") {
		t.Fatalf("EncodeExtractorResult() error = %v", err)
	}
	if _, err := EncodeProcessorRequest(ProcessorRequest{}); err == nil ||
		!strings.Contains(err.Error(), "ProcessorRequest.history.messages") {
		t.Fatalf("EncodeProcessorRequest() error = %v", err)
	}
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	payload, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return payload
}

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
