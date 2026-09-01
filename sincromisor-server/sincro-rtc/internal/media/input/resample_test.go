package input

import (
	"crypto/sha256"
	"fmt"
	"math"
	"strings"
	"testing"
)

func TestFIRCoefficientTableSHA256(t *testing.T) {
	values := make([]string, len(firCoefficients))
	for index, coefficient := range firCoefficients {
		values[index] = fmt.Sprintf("%.12f", coefficient)
	}
	got := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join(values, ","))))
	const want = "a30034c8f42709985e49490975a4df63d6d9c194f608a5de50ab17a5cffba64a"
	if got != want {
		t.Fatalf("coefficient SHA-256 = %s, want %s", got, want)
	}
}

func TestStreamingResamplerGoldenResponse(t *testing.T) {
	tests := []struct {
		name        string
		frequency   float64
		maxGainDB   float64
		minGainDB   float64
		checkOutput bool
	}{
		{name: "one_kilohertz_passband", frequency: 1000, maxGainDB: 0.5, minGainDB: -0.5, checkOutput: true},
		{name: "ten_kilohertz_stopband", frequency: 10000, maxGainDB: -30, minGainDB: -200},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := sinePCM(test.frequency, SampleRate)
			resampler := streamingResampler{}
			output := resampler.process(input)
			if len(output) != len(input)/resampleFactor {
				t.Fatalf("output samples = %d, want %d", len(output), len(input)/resampleFactor)
			}
			const settle = 100
			gainDB := 20 * math.Log10(rms(output[settle:])/(10000/math.Sqrt2))
			if gainDB < test.minGainDB || gainDB > test.maxGainDB {
				t.Fatalf("gain = %.2f dB, want [%.2f, %.2f]", gainDB, test.minGainDB, test.maxGainDB)
			}
			if test.checkOutput {
				frequency := zeroCrossingFrequency(output[settle:], SampleRate/resampleFactor)
				if math.Abs(frequency-test.frequency) > 5 {
					t.Fatalf("frequency = %.2f Hz, want %.2f ±5 Hz", frequency, test.frequency)
				}
			}
		})
	}
}

func TestDownmixStereoPreservesMonoAndCancelsOppositeChannels(t *testing.T) {
	mono := downmixStereo([]int16{1200, 1200, -32000, -32000})
	if mono[0] != 1200 || mono[1] != -32000 {
		t.Fatalf("duplicated mono downmix = %v", mono)
	}
	opposite := downmixStereo([]int16{32767, -32767, -30000, 30000})
	if opposite[0] != 0 || opposite[1] != 0 {
		t.Fatalf("opposite stereo downmix = %v, want silence", opposite)
	}
}

func TestStreamingResamplerRetainsPhaseAndHistoryAcrossPackets(t *testing.T) {
	input := sinePCM(1000, 1001)
	whole := (&streamingResampler{}).process(input)
	chunkedResampler := &streamingResampler{}
	var chunked []int16
	for _, chunk := range [][]int16{input[:17], input[17:648], input[648:]} {
		chunked = append(chunked, chunkedResampler.process(chunk)...)
	}
	if len(chunked) != len(input)/resampleFactor {
		t.Fatalf("chunked output samples = %d, want %d", len(chunked), len(input)/resampleFactor)
	}
	for index := range whole {
		if chunked[index] != whole[index] {
			t.Fatalf("chunked output[%d] = %d, want %d", index, chunked[index], whole[index])
		}
	}
}

func sinePCM(frequency float64, samples int) []int16 {
	pcm := make([]int16, samples)
	for index := range pcm {
		pcm[index] = int16(math.Round(10000 * math.Sin(2*math.Pi*frequency*float64(index)/SampleRate)))
	}
	return pcm
}

func rms(samples []int16) float64 {
	var squares float64
	for _, sample := range samples {
		value := float64(sample)
		squares += value * value
	}
	return math.Sqrt(squares / float64(len(samples)))
}

func zeroCrossingFrequency(samples []int16, sampleRate int) float64 {
	crossings := 0
	for index := 1; index < len(samples); index++ {
		if samples[index-1] <= 0 && samples[index] > 0 {
			crossings++
		}
	}
	duration := float64(len(samples)-1) / float64(sampleRate)
	return float64(crossings) / duration
}
