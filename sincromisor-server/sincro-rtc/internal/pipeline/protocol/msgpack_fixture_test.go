package protocol

import (
	"bytes"
	"os"
	"testing"
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

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	payload, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return payload
}
