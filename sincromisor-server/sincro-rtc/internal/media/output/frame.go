package output

import (
	"fmt"
	"math"

	pionmedia "github.com/pion/webrtc/v4/pkg/media"
)

func (p *Processor) writeFrame() error {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return ErrOutputClosed
	}
	samplePosition := p.samplePosition
	pendingDrops := p.pendingDrops
	p.mu.Unlock()
	if pendingDrops > math.MaxUint16 {
		return fmt.Errorf("outbound dropped slot count %d exceeds Pion packetizer limit", pendingDrops)
	}
	frame, telop := p.nextFrame()
	packet, err := p.encoder.Encode(frame)
	if err != nil {
		p.observer.CodecError("encode_out")
		p.observer.PacingAbort("codec")
		return err
	}
	if telop != nil && p.telop != nil {
		if err := p.telop(*telop); err != nil {
			return fmt.Errorf("enqueue outbound telop: %w", err)
		}
	}
	if err := p.track.WriteSample(Sample{
		MediaSample: pionmedia.Sample{
			Data: packet, Duration: FrameDuration, PrevDroppedPackets: uint16(pendingDrops),
		},
		SamplePosition: samplePosition,
		RTPTimestamp:   uint32(samplePosition),
	}); err != nil {
		return fmt.Errorf("write outbound audio: %w", err)
	}
	p.observer.AudioFrame("out", "sent")
	// Pionがdrop metadataを受理した成功点だけでpending countを消費する。
	// track error時はRunが終了するため、不完全なclock stateで次packetを送らない。
	p.mu.Lock()
	p.pendingDrops = 0
	p.samplePosition += frameSamples
	p.mu.Unlock()
	return nil
}

// nextFrameはqueue itemの48 kHz sample位置をaudio frameとtelopの共通tickとして進める。
//
// frame内で始まるmoraは次frameまで切り替えず、frame開始sampleを含むactive moraだけを返す。
// 最終audio frameはsilence paddingするが、itemのsample accountingは実PCM分だけを消費する。
func (p *Processor) nextFrame() ([]int16, *TelopPayload) {
	p.mu.Lock()
	frame := make([]int16, frameSamples)
	if len(p.queue) == 0 {
		p.mu.Unlock()
		return frame, nil
	}
	item := p.queue[0]
	start := item.offset
	end := start + frameSamples
	if end > len(item.speech.PCM) {
		end = len(item.speech.PCM)
	}
	copy(frame, item.speech.PCM[start:end])
	var payload *TelopPayload
	for item.mora < len(item.speech.Mora) && item.speech.Mora[item.mora].EndSample <= uint64(start) {
		item.mora++
	}
	if item.mora < len(item.speech.Mora) {
		mora := item.speech.Mora[item.mora]
		if mora.StartSample <= uint64(start) && uint64(start) < mora.EndSample {
			newText := item.lastMoraSent != item.mora
			payload = &TelopPayload{
				SpeechID:  item.speech.SpeechID,
				Timestamp: float64(start) / SampleRate,
				Message:   item.message,
				Vowel:     stringValue(mora.Vowel),
				Text:      stringValue(mora.Text),
				Length:    float64(mora.EndSample-mora.StartSample) / SampleRate,
				NewText:   newText,
			}
			item.lastMoraSent = item.mora
		}
	}
	consumed := end - start
	item.offset = end
	p.queuedSamples -= consumed
	if item.offset == len(item.speech.PCM) {
		p.queue = p.queue[1:]
		p.mu.Unlock()
		p.observer.QueueDepthDelta("speech", -1)
		return frame, payload
	}
	p.mu.Unlock()
	return frame, payload
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
