package media

import "math"

const (
	resampleFactor = 3
	firTapCount    = 63
)

// firCoefficientsは3:1 decimation前にaliasを抑える63-tap、beta=5のKaiser-windowed sinc low-passである。
//
// 7.2 kHz cutoffにより出力Nyquist 8 kHzまでtransition bandを確保する。係数は対称、DC gain 1.0へ
// 正規化後1e-12で丸めており、変更時はfrequency-response goldenとSHA-256 assertionの更新が必要である。
var firCoefficients = [firTapCount]float64{
	-0.000304839150, 0.000000000000, 0.000634316304, 0.001002996015,
	0.000425527338, -0.001032891403, -0.002201678533, -0.001597143469,
	0.001023300406, 0.003797367909, 0.003859449056, -0.000000000000,
	-0.005387615911, -0.007415624157, -0.002807699435, 0.006199015480,
	0.012204803541, 0.008284414951, -0.005023975020, -0.017835149769,
	-0.017521342997, 0.000000000000, 0.023609135780, 0.032526216135,
	0.012518288472, -0.028649020327, -0.060024947631, -0.045043292427,
	0.032095067184, 0.149904664431, 0.256819457208, 0.299882400042,
	0.256819457208, 0.149904664431, 0.032095067184, -0.045043292427,
	-0.060024947631, -0.028649020327, 0.012518288472, 0.032526216135,
	0.023609135780, 0.000000000000, -0.017521342997, -0.017835149769,
	-0.005023975020, 0.008284414951, 0.012204803541, 0.006199015480,
	-0.002807699435, -0.007415624157, -0.005387615911, -0.000000000000,
	0.003859449056, 0.003797367909, 0.001023300406, -0.001597143469,
	-0.002201678533, -0.001032891403, 0.000425527338, 0.001002996015,
	0.000634316304, 0.000000000000, -0.000304839150,
}

// streamingResamplerは1 SSRC streamのFIR historyと48 kHz入力の絶対phaseを所有する。
//
// stream先頭はfilterの31 sample group delayに相当するhistoryをzeroとして扱う。入力index
// n%3==2で出力してfloor(input/3) sampleとし、EOFではzero paddingを追加しない。
type streamingResampler struct {
	history [firTapCount]int16
	cursor  int
	inputs  uint64
}

// processはpacket境界を跨いでhistoryとdecimation phaseを保持し、新しく確定した16 kHz sampleだけを返す。
func (r *streamingResampler) process(input []int16) []int16 {
	output := make([]int16, 0, (len(input)+2)/resampleFactor)
	for _, sample := range input {
		r.history[r.cursor] = sample
		r.cursor = (r.cursor + 1) % firTapCount
		if r.inputs%resampleFactor == resampleFactor-1 {
			var sum float64
			for tap, coefficient := range firCoefficients {
				index := r.cursor - 1 - tap
				if index < 0 {
					index += firTapCount
				}
				sum += float64(r.history[index]) * coefficient
			}
			output = append(output, clampPCM(math.Round(sum)))
		}
		r.inputs++
	}
	return output
}

// clampPCMはfloat64積和をroundした後だけs16leの表現範囲へ飽和させる。
func clampPCM(value float64) int16 {
	if value > math.MaxInt16 {
		return math.MaxInt16
	}
	if value < math.MinInt16 {
		return math.MinInt16
	}
	return int16(value)
}
