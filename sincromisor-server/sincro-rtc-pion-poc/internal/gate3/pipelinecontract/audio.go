package pipelinecontract

import "encoding/binary"

const (
	synthesizedSampleRate = 24_000
	synthesizedSamples    = synthesizedSampleRate * 375 / 1000
)

// synthesizedWAV は契約serviceが返す0.375秒のmono PCM WAVを組み立てる。
//
// 固定振幅を反転した非無音であり、音質ではなくFFmpeg、Pion、Web Audioの
// 実decode/playback経路を決定的に通すことだけを責務とする。
func synthesizedWAV() []byte {
	const headerSize = 44
	dataSize := synthesizedSamples * 2
	payload := make([]byte, headerSize+dataSize)
	copy(payload[0:4], "RIFF")
	binary.LittleEndian.PutUint32(payload[4:8], uint32(len(payload)-8))
	copy(payload[8:12], "WAVE")
	copy(payload[12:16], "fmt ")
	binary.LittleEndian.PutUint32(payload[16:20], 16)
	binary.LittleEndian.PutUint16(payload[20:22], 1)
	binary.LittleEndian.PutUint16(payload[22:24], 1)
	binary.LittleEndian.PutUint32(payload[24:28], synthesizedSampleRate)
	binary.LittleEndian.PutUint32(payload[28:32], synthesizedSampleRate*2)
	binary.LittleEndian.PutUint16(payload[32:34], 2)
	binary.LittleEndian.PutUint16(payload[34:36], 16)
	copy(payload[36:40], "data")
	binary.LittleEndian.PutUint32(payload[40:44], uint32(dataSize))
	for index := range synthesizedSamples {
		sample := int16(6000)
		if index/60%2 != 0 {
			sample = -sample
		}
		binary.LittleEndian.PutUint16(payload[headerSize+index*2:], uint16(sample))
	}
	return payload
}
