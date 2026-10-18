package protocol

import (
	"math"
	"os"
	"testing"

	"github.com/vmihailenco/msgpack/v5"
)

func TestPythonSynthChunkFixtureAndStrictFields(t *testing.T) {
	raw, err := os.ReadFile("testdata/voice_synthesizer_chunk.msgpack")
	if err != nil {
		t.Fatal(err)
	}
	chunk, err := DecodeSynthesizerChunk(raw)
	if err != nil || chunk.RequestID != 1 || chunk.Sequence != 0 || len(chunk.PCM) == 0 || chunk.Final {
		t.Fatalf("Python chunk = %+v, %v", chunk, err)
	}
	var fields map[string]any
	if err := msgpack.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	for key := range fields {
		t.Run("missing_"+key, func(t *testing.T) {
			missing := make(map[string]any, len(fields))
			for name, value := range fields {
				if name != key {
					missing[name] = value
				}
			}
			encoded, _ := msgpack.Marshal(missing)
			if _, err := DecodeSynthesizerChunk(encoded); err == nil {
				t.Fatal("missing required field accepted")
			}
		})
	}
	for key, value := range map[string]any{"request_id": true, "speech_id": 1.0, "sequence": "0", "sample_offset": nil, "final": 0, "pcm": "PCM", "message": []byte{}, "mora_queue": nil} {
		t.Run("type_"+key, func(t *testing.T) {
			old := fields[key]
			fields[key] = value
			encoded, _ := msgpack.Marshal(fields)
			fields[key] = old
			if _, err := DecodeSynthesizerChunk(encoded); err == nil {
				t.Fatal("invalid field type accepted")
			}
		})
	}
	if _, err := DecodeSynthesizerChunk(append(raw, 0)); err == nil {
		t.Fatal("trailing object accepted")
	}
}

func TestChunkSequenceRejectsMissingDuplicateRegressedAndUnfinishedRequests(t *testing.T) {
	first := SynthesizerChunk{RequestID: 1, SpeechID: 7, PCM: make([]byte, 960*2), MoraQueue: []SynthesizerMora{}}
	tests := map[string]func(SynthesizerChunk) SynthesizerChunk{
		"duplicate": func(v SynthesizerChunk) SynthesizerChunk { return v },
		"missing":   func(v SynthesizerChunk) SynthesizerChunk { v.Sequence = 2; v.SampleOffset = 960; return v },
		"offset":    func(v SynthesizerChunk) SynthesizerChunk { v.Sequence = 1; v.SampleOffset = 959; return v },
		"speech": func(v SynthesizerChunk) SynthesizerChunk {
			v.Sequence = 1
			v.SampleOffset = 960
			v.SpeechID++
			return v
		},
		"new_before_final": func(v SynthesizerChunk) SynthesizerChunk { v.RequestID++; return v },
	}
	for name, change := range tests {
		t.Run(name, func(t *testing.T) {
			var stream ChunkSequence
			if err := stream.Accept(first); err != nil {
				t.Fatal(err)
			}
			if err := stream.Accept(change(first)); err == nil {
				t.Fatal("invalid continuation accepted")
			}
		})
	}
	var stream ChunkSequence
	if err := stream.Accept(first); err != nil {
		t.Fatal(err)
	}
	terminal := SynthesizerChunk{RequestID: 1, SpeechID: 7, Sequence: 1, SampleOffset: 960, Final: true, PCM: []byte{}, MoraQueue: []SynthesizerMora{}}
	if err := stream.Accept(terminal); err != nil {
		t.Fatal(err)
	}
	if err := stream.Accept(terminal); err == nil {
		t.Fatal("duplicate terminal accepted")
	}
	first.RequestID = 2
	if err := stream.Accept(first); err != nil {
		t.Fatal(err)
	}
}

func TestChunkLimitsAndMetadata(t *testing.T) {
	value := SynthesizerChunk{RequestID: 1, PCM: make([]byte, SynthChunkSampleLimit*2), MoraQueue: []SynthesizerMora{}}
	var stream ChunkSequence
	for index := int64(0); index < 240; index++ {
		value.Sequence = index
		value.SampleOffset = index * SynthChunkSampleLimit
		if err := stream.Accept(value); err != nil {
			t.Fatal(err)
		}
	}
	value.Sequence++
	value.SampleOffset += SynthChunkSampleLimit
	if err := stream.Accept(value); err == nil {
		t.Fatal("more than 120 seconds accepted")
	}
	for _, length := range []float64{math.NaN(), math.Inf(1), -1, 121} {
		value.Sequence = 0
		value.SampleOffset = 0
		value.MoraQueue = []SynthesizerMora{{Length: length}}
		if err := ValidateSynthesizerChunk(value); err == nil {
			t.Fatalf("invalid mora length %v accepted", length)
		}
	}
}
