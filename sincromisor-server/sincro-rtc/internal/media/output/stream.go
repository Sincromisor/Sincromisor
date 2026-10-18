package output

import (
	"encoding/binary"
	"errors"
	"math"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// StreamBufferSamples はEngine最初の0.3秒区間に合わせた初期・再開バッファ量である。
// 生成不足を完全には防げないため、不足時は音声位置を固定して同量まで再度待つ。
const StreamBufferSamples = SampleRate * 3 / 10

// streamSpeech は一要求の再生位置と不足待機を所有する。baseは同じ発話の過去要求の総サンプル数、
// playedはこの要求内だけの消費数である。droppedは遅延中止後の遅着による復活を防ぐ。
type streamSpeech struct {
	base     uint64
	played   int
	complete bool
	ready    bool
	dropped  bool
}

// EnqueueChunk は要求ごとに受信PCMを追記し、同じ再生項目の時刻とモーラ位置を維持する。
// 単一区間と要求順序を再検証し、8要求・未再生120秒の上限超過時は追加を拒否する。
// 通信取消はSessionの世代境界がPurgeへ集約し、ここでは待機や処理担当を作らない。
func (p *Processor) EnqueueChunk(value protocol.SynthesizerChunk) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return ErrOutputClosed
	}
	sequence := p.streamSequence
	if err := sequence.Accept(value); err != nil {
		return err
	}
	if value.Sequence == 0 {
		if err := p.beginStream(value); err != nil {
			return err
		}
	}
	item := p.incoming
	if item == nil || item.stream == nil {
		return errors.New("synthesis stream state is missing")
	}
	if value.Final {
		if err := finishStream(item, value.SampleOffset); err != nil {
			return err
		}
		p.streamLastSamples = item.stream.base + uint64(value.SampleOffset)
		if item.offset == len(item.speech.PCM) && !item.stream.dropped {
			for index, queued := range p.queue {
				if queued == item {
					p.queue = append(p.queue[:index], p.queue[index+1:]...)
					p.observer.QueueDepthDelta("speech", -1)
					break
				}
			}
		}
	} else if !item.stream.dropped {
		if p.queuedSamples+len(value.PCM)/2 > SpeechQueueSampleCapacity {
			return ErrSpeechQueueFull
		}
		// 消費済みの先頭を参照から外して追記する。未消費音声全体の毎回コピーを避け、
		// 受信が再生より速い場合もsliceの成長で保持量を未再生分の上限に制限する。
		remaining := item.speech.PCM[item.offset:]
		pcm := append(remaining, make([]int16, len(value.PCM)/2)...)
		for index := range len(value.PCM) / 2 {
			pcm[len(remaining)+index] = int16(binary.LittleEndian.Uint16(value.PCM[index*2:]))
		}
		item.speech.PCM, item.offset = pcm, 0
		p.queuedSamples += len(value.PCM) / 2
	}
	p.streamSequence = sequence
	return nil
}

// beginStream は先頭メタデータを一度だけ再生項目へ固定し、本文増分間の発話時刻を連結する。
func (p *Processor) beginStream(value protocol.SynthesizerChunk) error {
	if len(p.queue) >= SpeechQueueCapacity || p.queuedSamples+len(value.PCM)/2 > SpeechQueueSampleCapacity {
		return ErrSpeechQueueFull
	}
	mora := make([]synthdecode.TimedMora, len(value.MoraQueue))
	var seconds float64
	var previous uint64
	for index, input := range value.MoraQueue {
		seconds += input.Length
		end := uint64(math.Round(seconds * SampleRate))
		mora[index] = synthdecode.TimedMora{StartSample: previous, EndSample: end, Vowel: input.Vowel, Text: input.Text}
		previous = end
	}
	var base uint64
	if p.streamLastSpeech == value.SpeechID {
		base = p.streamLastSamples
	}
	item := &queuedSpeech{
		message: value.Message, lastMoraSent: -1,
		speech: synthdecode.DecodedSpeech{SpeechID: value.SpeechID, Mora: mora},
		stream: &streamSpeech{base: base},
	}
	p.queue = append(p.queue, item)
	p.incoming = item
	p.streamLastSpeech = value.SpeechID
	p.observer.QueueDepthDelta("speech", 1)
	return nil
}

// finishStream は最後の通知でだけ要求を完成させる。末尾無音の時刻差だけPCM末尾へ収める。
func finishStream(item *queuedSpeech, samples int64) error {
	for index := range item.speech.Mora {
		mora := &item.speech.Mora[index]
		if mora.EndSample <= uint64(samples) {
			continue
		}
		if index != len(item.speech.Mora)-1 || mora.Vowel != nil || mora.Text != nil {
			return errors.New("synthesis mora extends beyond complete PCM")
		}
		mora.EndSample = uint64(samples)
		if mora.StartSample > mora.EndSample {
			return errors.New("synthesis terminal mora begins beyond complete PCM")
		}
	}
	item.stream.complete = true
	return nil
}

// streamReady は完全な20ms枠が届くまでサンプル・モーラを進めず無音を返す。
// 完成済みの末尾だけは端数を無音で埋める。初期待機と再開待機は同じ閾値を使う。
func streamReady(item *queuedSpeech) bool {
	available := len(item.speech.PCM) - item.offset
	if !item.stream.ready && (available >= StreamBufferSamples || item.stream.complete) {
		item.stream.ready = true
	}
	if !item.stream.complete && available < frameSamples {
		item.stream.ready = false
	}
	return item.stream.ready && available > 0
}
