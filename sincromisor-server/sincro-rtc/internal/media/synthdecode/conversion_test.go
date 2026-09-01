package synthdecode

import (
	"context"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestDecodeMapsCumulativeMoraAndPreservesPointers(t *testing.T) {
	empty := ""
	vowel := "a"
	text := "あ"
	input := validResult("audio/wav")
	input.MoraQueue = []protocol.SynthesizerMora{
		{Vowel: nil, Text: &empty, Length: 0.000011},
		{Vowel: &vowel, Text: &text, Length: 0.000011},
		{Vowel: &empty, Text: nil, Length: 0},
	}
	result, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(4_800)}).Decode(context.Background(), input)
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	wantBounds := [][2]uint64{{0, 1}, {1, 1}, {1, 1}}
	for index, mora := range result.Mora {
		if mora.StartSample != wantBounds[index][0] || mora.EndSample != wantBounds[index][1] {
			t.Errorf("Mora[%d] bounds = %d..%d, want %d..%d",
				index, mora.StartSample, mora.EndSample, wantBounds[index][0], wantBounds[index][1])
		}
	}
	if result.Mora[0].Vowel != nil || result.Mora[0].Text == nil || *result.Mora[0].Text != "" ||
		result.Mora[2].Vowel == nil || *result.Mora[2].Vowel != "" || result.Mora[2].Text != nil {
		t.Fatalf("Mora nil/empty values were not preserved: %#v", result.Mora)
	}
}

func TestDecodeAcceptsEmptyAndShortMoraQueue(t *testing.T) {
	for _, queue := range [][]protocol.SynthesizerMora{
		{},
		{{Length: 0.05}},
		{{Length: 0.1}},
	} {
		input := validResult("audio/wav")
		input.MoraQueue = queue
		if _, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(4_800)}).Decode(context.Background(), input); err != nil {
			t.Fatalf("Decode(queue=%v) error = %v", queue, err)
		}
	}
}

func TestDecodeClampsTerminalSilentMoraToPCM(t *testing.T) {
	input := validResult("audio/wav")
	input.SpeakingTime = 65_024.0 / outputSampleRate
	input.MoraQueue = []protocol.SynthesizerMora{
		{Length: 64_000.0 / outputSampleRate},
		{Length: 2_071.0 / outputSampleRate},
	}
	result, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(65_024)}).Decode(context.Background(), input)
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	for index, mora := range result.Mora {
		if mora.StartSample > mora.EndSample || mora.EndSample > uint64(len(result.PCM)) {
			t.Fatalf("Mora[%d] bounds = %d..%d, PCM samples = %d", index, mora.StartSample, mora.EndSample, len(result.PCM))
		}
	}
	if got := result.Mora[len(result.Mora)-1].EndSample; got != 65_024 {
		t.Fatalf("terminal silent mora end = %d, want 65024", got)
	}
}

func TestDecodeRejectsMoraPastAudioAndSpeakingMismatch(t *testing.T) {
	text := "あ"
	for _, test := range []struct {
		name string
		mora []protocol.SynthesizerMora
	}{
		{name: "non-terminal mora past audio", mora: []protocol.SynthesizerMora{{Length: 0.10002}, {Length: 0}}},
		{name: "voiced terminal mora past audio", mora: []protocol.SynthesizerMora{{Text: &text, Length: 0.10002}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := validResult("audio/wav")
			input.MoraQueue = test.mora
			_, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(4_800)}).Decode(context.Background(), input)
			assertDecodeKind(t, err, ErrorInvalid)
		})
	}
	for _, test := range []struct {
		name    string
		samples int
	}{
		{name: "960 sample difference accepted", samples: 3_840},
		{name: "961 sample difference rejected", samples: 3_839},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := validResult("audio/wav")
			input.MoraQueue = nil
			_, err := newFakeDecoder(t, &fakeRunner{stdout: pcmBytes(test.samples)}).Decode(context.Background(), input)
			if test.samples == 3_840 {
				if err != nil {
					t.Fatalf("Decode() error = %v, want tolerance boundary accepted", err)
				}
				return
			}
			assertDecodeKind(t, err, ErrorInvalid)
		})
	}
}
