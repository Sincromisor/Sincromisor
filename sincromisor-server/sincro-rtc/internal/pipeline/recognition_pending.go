package pipeline

import (
	"errors"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// 未送信は出力キューと同じ16発話、PCM合計1MiBに制限する。単一要求では
// MessagePackのメタデータへ4KiBを残し、送信時にもクライアントの全体1MiB検査を通す。
// 超過は世代回復へ渡し、黙って音声を削除しない。送信中は別に最大1要求を保持する。
const (
	recognitionPendingCapacity = 16
	recognitionPendingBytes    = 1 << 20
	recognitionRequestPCMBytes = (1 << 20) - 4096
)

// pendingRecognition は同じ発話の未送信差分と、最初に保留した単調時計の時刻を所有する。
type pendingRecognition struct {
	value   protocol.ExtractorResult
	since   time.Time
	records uint64
}

// enqueueRecognition はconversation.mu下で呼ぶ。送信済み音声を結合せず、末尾の
// 通番・確定状態・start_atを採用する。音声形式が違う入力は同じ発話へ混ぜない。
func (c *conversation) enqueueRecognition(value protocol.ExtractorResult) error {
	if value.VoiceDType != "int16" || value.VoiceSamplingRate != 16_000 ||
		value.VoiceSampleBytes != 2 || value.VoiceChannels != 1 || len(value.Voice)%2 != 0 {
		return errors.New("extractor audio must be 16 kHz mono int16 PCM")
	}
	last := len(c.pending) - 1
	merge := last >= 0 && c.pending[last].value.SpeechID == value.SpeechID
	bytes := len(value.Voice)
	if merge {
		bytes += len(c.pending[last].value.Voice)
	}
	if bytes > recognitionRequestPCMBytes || c.pendingBytes+len(value.Voice) > recognitionPendingBytes ||
		(!merge && len(c.pending) >= recognitionPendingCapacity) {
		return errors.New("recognition pending audio limit exceeded")
	}
	c.pendingBytes += len(value.Voice)
	if merge {
		pending := &c.pending[last]
		value.Voice = append(pending.value.Voice, value.Voice...)
		pending.value = value
		pending.records++
	} else {
		// Extractorの受信DTOから所有権を切り離し、送信が同時に走っても配列を書き換えない。
		value.Voice = append([]byte{}, value.Voice...)
		c.pending = append(c.pending, pendingRecognition{value: value, since: time.Now(), records: 1})
	}
	c.signalRecognition()
	return nil
}

// signalRecognition は保留追加と応答受理を同じ通知へ集約する。状態はmuが正本であり、
// 通知自体に項目を持たせないので満杯時に通知をまとめても入力は失われない。
func (c *conversation) signalRecognition() {
	select {
	case c.recognitionReady <- struct{}{}:
	default:
	}
}

// nextRecognition は未応答がない場合だけ先頭を取得し、ネットワーク送信より先に
// 照合へ登録する。即時応答も登録済みとなり、送信失敗時は世代全体で回収する。
func (c *conversation) nextRecognition() (pendingRecognition, uint64, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.outstanding) != 0 || len(c.pending) == 0 {
		return pendingRecognition{}, 0, false
	}
	item := c.pending[0]
	c.pending[0] = pendingRecognition{}
	c.pending = c.pending[1:]
	c.pendingBytes -= len(item.value.Voice)
	c.outstanding[item.value.SequenceID] = item.value
	c.recognitionSent++
	return item, c.recognitionSent, true
}

// recognitionSendLoop は世代に属する唯一の認識送信者であり、取消で終了してwgが回収する。
// 応答受理時に再開するため、表示や文章処理の待機を次の認識送信へ持ち込まない。
func (c *Coordinator) recognitionSendLoop(work *generationWork, recognizer RecognizerClient) {
	for {
		select {
		case <-work.ctx.Done():
			return
		case <-work.conv.recognitionReady:
			if work.ctx.Err() != nil || !c.isCurrentGeneration(work.number, pclient.ServiceRecognizer) {
				return
			}
			item, count, ok := work.conv.nextRecognition()
			if !ok {
				continue
			}
			value := item.value
			pendingMS := time.Since(item.since).Milliseconds()
			if err := recognizer.SendExtraction(work.ctx, value); err != nil {
				c.runtimeFailure(work, pclient.ServiceRecognizer, "send_extraction", "write_failed", "speech_id", value.SpeechID, "sequence_id", value.SequenceID)
				return
			}
			c.logger.Info("recognition request sent", "stage", "recognition_request_sent",
				"session_id", value.SessionID, "speech_id", value.SpeechID, "sequence_id", value.SequenceID,
				"confirmed", value.Confirmed, "request_count", count, "extraction_count", item.records,
				"pending_ms", pendingMS)
		}
	}
}

// clearRecognition は世代workerを全てjoinした所有者が呼び、取消・送信失敗時も
// 未送信音声と未応答照合を解放する。旧世代への参照が残ってもPCMは保持しない。
func (c *conversation) clearRecognition() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pending = nil
	c.pendingBytes = 0
	clear(c.outstanding)
}
