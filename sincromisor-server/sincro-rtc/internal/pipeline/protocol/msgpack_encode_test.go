package protocol

import (
	"bytes"
	"strings"
	"testing"
)

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
