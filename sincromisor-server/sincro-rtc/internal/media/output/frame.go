package output

import (
	"fmt"
	"math"

	pionmedia "github.com/pion/webrtc/v4/pkg/media"

	medialog "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media"
)

// writeFrame は一枠の符号化・テロップ投入・RTP送信を行い、失敗操作と発話IDを返す。
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
	frame, telop, speechID := p.nextFrame()
	packet, err := p.encoder.Encode(frame)
	if err != nil {
		p.observer.CodecError("encode_out")
		p.observer.PacingAbort("codec")
		return &medialog.OperationError{Operation: "encode_opus", Err: err, SpeechID: speechID}
	}
	if telop != nil && p.telop != nil {
		if err := p.telop(*telop); err != nil {
			return &medialog.OperationError{Operation: "enqueue_telop", Err: fmt.Errorf("enqueue outbound telop: %w", err), SpeechID: speechID}
		}
	}
	if err := p.track.WriteSample(Sample{
		MediaSample: pionmedia.Sample{
			Data: packet, Duration: FrameDuration, PrevDroppedPackets: uint16(pendingDrops),
		},
		SamplePosition: samplePosition,
		RTPTimestamp:   uint32(samplePosition),
	}); err != nil {
		return &medialog.OperationError{Operation: "write_rtp", Err: fmt.Errorf("write outbound audio: %w", err), SpeechID: speechID}
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

// nextFrameは48 kHzの音声を20 msずつ消費する。診断PCMがあれば先に返し、テロップは生成しない。
// セッション構築時に入力経路を一つに固定するため、通常発話と診断PCMが同時に追加されることはない。
// 診断PCMの不足分、両キューが空の期間は無音で埋め、入力の有無によらず出力時計を維持する。
// 通常経路では発話のサンプル位置を音声とテロップの共通基準として進める。
//
// frame内で始まるmoraは次frameまで切り替えず、frame開始sampleを含むactive moraだけを返す。
// 最終audio frameはsilence paddingするが、itemのsample accountingは実PCM分だけを消費する。
// 発話IDは最終frameでキューから除去しても診断へ渡し、無音と診断PCMではnilを返す。
func (p *Processor) nextFrame() ([]int16, *TelopPayload, *int64) {
	p.mu.Lock()
	frame := make([]int16, frameSamples)
	if len(p.echoPCM) > 0 {
		consumed := min(frameSamples, len(p.echoPCM))
		copy(frame, p.echoPCM[:consumed])
		copy(p.echoPCM, p.echoPCM[consumed:])
		p.echoPCM = p.echoPCM[:len(p.echoPCM)-consumed]
		p.mu.Unlock()
		return frame, nil, nil
	}
	if len(p.queue) == 0 {
		p.mu.Unlock()
		return frame, nil, nil
	}
	item := p.queue[0]
	if item.stream != nil && !streamReady(item) {
		p.mu.Unlock()
		return frame, nil, nil
	}
	start := item.offset
	position := start
	if item.stream != nil {
		position = item.stream.played
	}
	end := start + frameSamples
	if end > len(item.speech.PCM) {
		end = len(item.speech.PCM)
	}
	copy(frame, item.speech.PCM[start:end])
	payload := speechTelop(item, position)
	consumed := end - start
	item.offset = end
	if item.stream != nil {
		item.stream.played += consumed
		if !item.stream.complete && len(item.speech.PCM)-end < frameSamples {
			item.stream.ready = false
		}
		if payload != nil {
			payload.Timestamp += float64(item.stream.base) / SampleRate
		}
	}
	p.queuedSamples -= consumed
	if item.offset == len(item.speech.PCM) && item.stream != nil {
		// 要求の時刻はstream.playedに保持済み。terminal待機中も消費済みPCMを残さない。
		item.speech.PCM = nil
		item.offset = 0
	}
	if item.offset == len(item.speech.PCM) && (item.stream == nil || item.stream.complete) {
		p.queue = p.queue[1:]
		p.mu.Unlock()
		p.observer.QueueDepthDelta("speech", -1)
		return frame, payload, &item.speech.SpeechID
	}
	p.mu.Unlock()
	return frame, payload, &item.speech.SpeechID
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// speechTelop は受信区間と独立した要求内のサンプル位置から、現在のモーラと先頭表示を求める。
func speechTelop(item *queuedSpeech, position int) *TelopPayload {
	var payload *TelopPayload
	for item.mora < len(item.speech.Mora) && item.speech.Mora[item.mora].EndSample <= uint64(position) {
		item.mora++
	}
	if item.mora < len(item.speech.Mora) {
		mora := item.speech.Mora[item.mora]
		if mora.StartSample <= uint64(position) && uint64(position) < mora.EndSample {
			newText := item.lastMoraSent != item.mora
			payload = &TelopPayload{
				SpeechID:  item.speech.SpeechID,
				Timestamp: float64(position) / SampleRate,
				Message:   item.message,
				Vowel:     stringValue(mora.Vowel),
				Text:      stringValue(mora.Text),
				Length:    float64(mora.EndSample-mora.StartSample) / SampleRate,
				NewText:   newText,
			}
			item.lastMoraSent = item.mora
		}
	}
	return payload
}
