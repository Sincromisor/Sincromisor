package protocol

import (
	"math"
	"strings"
	"testing"
)

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
