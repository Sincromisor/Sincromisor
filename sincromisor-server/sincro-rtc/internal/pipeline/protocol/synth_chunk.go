package protocol

import (
	"errors"
	"fmt"
	"math"
)

const (
	// SynthChunkSampleLimit は一つの区間へ許す48 kHz monoサンプル数である。
	SynthChunkSampleLimit = 24_000
	// SynthRequestSampleLimit は一つの合成要求へ許す120秒分のサンプル数である。
	SynthRequestSampleLimit = 48_000 * 120
)

// SynthesizerChunk は一つの合成要求のPCM区間または完了通知である。
// 先頭だけが表示文と全モーラを持ち、完了は空PCMと最終sample_offsetで全受信を確定する。
// PCMは48 kHz monoのs16le。既存の完全音声DTOとは用途とwireを分離する。
type SynthesizerChunk struct {
	RequestID    int64             `msgpack:"request_id"`    // RequestIDは接続内の合成要求連番で、1から始まる。
	SpeechID     int64             `msgpack:"speech_id"`     // SpeechIDは複数のテキスト増分を同じ発話へ結び付ける。
	Sequence     int64             `msgpack:"sequence"`      // Sequenceは要求内で0から増える区間連番である。
	SampleOffset int64             `msgpack:"sample_offset"` // SampleOffsetは要求先頭からのPCMサンプル位置である。
	Final        bool              `msgpack:"final"`         // Finalは全PCMの受信・検証が終了したことを表す。
	PCM          []byte            `msgpack:"pcm"`           // PCMはDTO所有のバイナリーで、完了時だけ空になる。
	Message      string            `msgpack:"message"`       // Messageは先頭区間だけが持つ表示文である。
	MoraQueue    []SynthesizerMora `msgpack:"mora_queue"`    // MoraQueueは先頭区間だけが持つ要求基準の時刻列である。
}

// DecodeSynthesizerChunk はMessagePackの型と単一区間の制約を検査する。
// 要求を跨ぐ順序とサンプル位置はChunkSequenceが接続単位で検証する。
func DecodeSynthesizerChunk(payload []byte) (SynthesizerChunk, error) {
	const model = "SynthesizerChunk"
	root, err := decodeRoot(model, payload)
	if err != nil {
		return SynthesizerChunk{}, err
	}
	var value SynthesizerChunk
	for key, target := range map[string]*int64{"request_id": &value.RequestID, "speech_id": &value.SpeechID, "sequence": &value.Sequence, "sample_offset": &value.SampleOffset} {
		if *target, err = requiredInt64(root, model, key); err != nil {
			return value, err
		}
	}
	if value.Final, err = requiredBool(root, model, "final"); err != nil {
		return value, err
	}
	if value.PCM, err = requiredBinary(root, model, "pcm"); err != nil {
		return value, err
	}
	if value.Message, err = requiredString(root, model, "message"); err != nil {
		return value, err
	}
	value.MoraQueue, err = decodeMoraQueue(root, model)
	if err != nil {
		return value, err
	}
	return value, ValidateSynthesizerChunk(value)
}

// ValidateSynthesizerChunk は復号以外の内部入力でも同じPCM・メタデータ制約を適用する。
func ValidateSynthesizerChunk(value SynthesizerChunk) error {
	if value.RequestID < 1 || value.Sequence < 0 || value.SampleOffset < 0 || value.SampleOffset > SynthRequestSampleLimit {
		return errors.New("synthesis chunk identity or position is invalid")
	}
	if value.MoraQueue == nil {
		return errors.New("synthesis chunk mora queue must not be nil")
	}
	if value.PCM == nil || len(value.PCM)%2 != 0 || len(value.PCM)/2 > SynthChunkSampleLimit {
		return errors.New("synthesis chunk PCM representation is invalid")
	}
	if value.Final != (len(value.PCM) == 0) || (value.Final && value.Sequence == 0) {
		return errors.New("synthesis chunk completion is invalid")
	}
	if value.Sequence != 0 && (value.Message != "" || len(value.MoraQueue) != 0) {
		return errors.New("synthesis chunk repeats initial metadata")
	}
	var length float64
	for _, mora := range value.MoraQueue {
		length += mora.Length
		if mora.Length < 0 || math.IsNaN(length) || math.IsInf(length, 0) || length > 120 {
			return errors.New("synthesis chunk mora timing is invalid")
		}
	}
	return nil
}

// ChunkSequence は接続内の直列合成要求の順序だけを所有し、PCMを保持しない。
// 新要求は前要求の完了後に限り受理する。完了済み要求や中断要求の復活を許さない。
type ChunkSequence struct {
	requestID int64
	speechID  int64
	sequence  int64
	samples   int64
	complete  bool
}

// Accept は欠損・重複・逆行を拒否し、成功時だけ次区間の期待位置を進める。
func (s *ChunkSequence) Accept(value SynthesizerChunk) error {
	if err := ValidateSynthesizerChunk(value); err != nil {
		return err
	}
	next := *s
	if next.requestID == 0 || next.complete {
		if value.RequestID != next.requestID+1 || value.Sequence != 0 || value.SampleOffset != 0 {
			return errors.New("synthesis request did not begin at expected identity")
		}
		next = ChunkSequence{requestID: value.RequestID, speechID: value.SpeechID}
	}
	if value.RequestID != next.requestID || value.SpeechID != next.speechID || value.Sequence != next.sequence || value.SampleOffset != next.samples {
		return errors.New("synthesis chunk order or sample position differs")
	}
	next.samples += int64(len(value.PCM) / 2)
	if next.samples > SynthRequestSampleLimit {
		return errors.New("synthesis request sample limit exceeded")
	}
	next.sequence++
	next.complete = value.Final
	*s = next
	return nil
}

// decodeMoraQueue は完全音声と逐次区間の共通モーラ表現を境界で検証する。
func decodeMoraQueue(root map[string]any, model string) ([]SynthesizerMora, error) {
	items, err := requiredList(root, model, "mora_queue")
	if err != nil {
		return nil, err
	}
	result := make([]SynthesizerMora, len(items))
	for index, item := range items {
		path := fmt.Sprintf("mora_queue[%d]", index)
		moraMap, ok := item.(map[string]any)
		if !ok || moraMap == nil {
			return nil, fieldError(model, path, "expected map")
		}
		if result[index].Vowel, err = requiredOptionalString(moraMap, model, path+".vowel"); err != nil {
			return nil, err
		}
		if result[index].Length, err = requiredFloat(moraMap, model, path+".length"); err != nil {
			return nil, err
		}
		if result[index].Text, err = requiredOptionalString(moraMap, model, path+".text"); err != nil {
			return nil, err
		}
	}
	return result, nil
}
