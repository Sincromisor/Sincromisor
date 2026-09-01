// Command generate_go_payloads はPython互換試験で使う決定的なGo生成MessagePackを出力する。
// 試験基盤専用であり、本番codecの公開境界ではない。
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func main() {
	outputDir := flag.String("output-dir", "", "directory that receives generated payloads")
	flag.Parse()
	if *outputDir == "" {
		fmt.Fprintln(os.Stderr, "--output-dir is required")
		os.Exit(2)
	}
	if err := writePayloads(*outputDir); err != nil {
		fmt.Fprintf(os.Stderr, "generate Go protocol payloads: %v\n", err)
		os.Exit(1)
	}
}

func writePayloads(outputDir string) error {
	requestMessage := protocol.ChatMessage{
		SpeechID:       42,
		MessageID:      "01J00000000000000000000001",
		MessageType:    "user",
		SpeakerID:      "fixture-user",
		SpeakerName:    "利用者",
		ExpressionCode: nil,
		Message:        "固定された認識文",
		CreatedAt:      1_700_000_001.25,
	}
	payloads := map[string]func() ([]byte, error){
		"extractor_initialize.msgpack": func() ([]byte, error) {
			return protocol.EncodeExtractorInitialize(protocol.ExtractorInitialize{
				SessionID:         "fixture-session",
				StartAt:           1_700_000_000.125,
				VoiceSamplingRate: 16_000,
				VoiceSampleBytes:  2,
				VoiceChannels:     1,
			})
		},
		"extractor_result.msgpack": func() ([]byte, error) {
			return protocol.EncodeExtractorResult(protocol.ExtractorResult{
				SessionID:         "fixture-session",
				SpeechID:          42,
				SequenceID:        7,
				StartAt:           1_700_000_000.5,
				Confirmed:         true,
				Voice:             []byte{0x00, 0x80, 0xff, 0xff, 0x00, 0x00, 0x01, 0x00, 0xff, 0x7f},
				VoiceDType:        "int16",
				VoiceSamplingRate: 16_000,
				VoiceSampleBytes:  2,
				VoiceChannels:     1,
			})
		},
		"text_processor_request.msgpack": func() ([]byte, error) {
			return protocol.EncodeProcessorRequest(protocol.ProcessorRequest{
				SessionID:      "fixture-session",
				SequenceID:     7,
				Confirmed:      true,
				History:        protocol.ChatHistory{Messages: []protocol.ChatMessage{requestMessage}},
				RequestMessage: requestMessage,
			})
		},
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}
	for filename, produce := range payloads {
		payload, err := produce()
		if err != nil {
			return fmt.Errorf("%s: %w", filename, err)
		}
		if err := os.WriteFile(filepath.Join(outputDir, filename), payload, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", filename, err)
		}
	}
	return nil
}
