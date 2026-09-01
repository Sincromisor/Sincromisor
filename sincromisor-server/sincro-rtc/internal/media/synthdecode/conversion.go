package synthdecode

import (
	"encoding/binary"
	"fmt"
	"math"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// mapMoraは各lengthを先に足したfloat64秒を境界ごとに丸め、丸め誤差の累積を防ぐ。
//
// 前境界をStart、現在境界をEndとするため0開始かつ非減少になる。mora総長は音声より短くても
// 有効である。producerの末尾無音だけは実PCM末尾へ収めるが、途中または表示値を持つmoraの
// 超過はcontainer取り違えや欠損を隠し得るため拒否する。
func mapMora(input []protocol.SynthesizerMora, samples int) ([]TimedMora, error) {
	output := make([]TimedMora, 0, len(input))
	var cumulativeSeconds float64
	var previous uint64
	for index, mora := range input {
		cumulativeSeconds += mora.Length
		if math.IsInf(cumulativeSeconds, 0) || math.IsNaN(cumulativeSeconds) {
			return nil, decodeInvalid("mora_timing_invalid", fmt.Errorf("mora %d cumulative length is not finite", index))
		}
		endFloat := math.Round(cumulativeSeconds * outputSampleRate)
		if endFloat > float64(samples) {
			if index != len(input)-1 || mora.Text != nil || mora.Vowel != nil {
				return nil, decodeInvalid("mora_timing_invalid", fmt.Errorf("mora %d ends after decoded audio", index))
			}
			endFloat = float64(samples)
		}
		end := uint64(endFloat)
		output = append(output, TimedMora{
			Vowel: mora.Vowel, Text: mora.Text, StartSample: previous, EndSample: end,
		})
		previous = end
	}
	return output, nil
}

// decodePCMはFFmpegのlittle-endian s16le byte列をGoの符号付きsample列へ変換する。
// channel数とsample rateは前段のFFmpeg引数で確定済みなので、ここでは表現変換だけを行う。
func decodePCM(raw []byte) []int16 {
	pcm := make([]int16, len(raw)/2)
	for index := range pcm {
		pcm[index] = int16(binary.LittleEndian.Uint16(raw[index*2:]))
	}
	return pcm
}
