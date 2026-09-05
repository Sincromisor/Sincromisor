package client

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

const recognizerReadLimit int64 = 1 << 20

// Recognizer は抽出済み発話を認識結果へ変換する接続を所有する。
// 接続と終了はbaseClient、再接続と世代の同期は上位のCoordinatorが担当する。
type Recognizer struct {
	*baseClient
	results chan protocol.RecognizerResult
}

// NewRecognizer は設定と依存を検証し、通信前の接続を作る。
// 接続先のパスと1 MiBの上限は通信契約として固定する。
func NewRecognizer(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Recognizer, error) {
	results := make(chan protocol.RecognizerResult)
	base, err := newBase(
		cfg, ServiceRecognizer, discovery.ServiceRecognizer, resolver, logger,
		"/api/v1/SpeechRecognizer/recognize", nil, recognizerReadLimit,
		func() { close(results) },
		decodeResults(results, protocol.DecodeRecognizerResult),
	)
	if err != nil {
		return nil, err
	}
	return &Recognizer{baseClient: base, results: results}, nil
}

// SendExtraction は発話区間を検証し、MessagePackで同期送信する。
// セッションの一致、非負のID、16 kHz・モノラル・int16の音声形式を要求し、入力の音声は保持しない。
// 接続状態と送信の失敗は共通接続処理から返す。
func (c *Recognizer) SendExtraction(ctx context.Context, value protocol.ExtractorResult) error {
	if value.SessionID != c.cfg.SessionID {
		return errors.New("recognizer extraction session ID does not match client")
	}
	if value.SpeechID < 0 || value.SequenceID < 0 {
		return errors.New("recognizer extraction IDs must be non-negative")
	}
	if value.VoiceDType != "int16" || value.VoiceSamplingRate != 16_000 ||
		value.VoiceSampleBytes != 2 || value.VoiceChannels != 1 {
		return errors.New("recognizer extraction must be 16 kHz mono int16 PCM")
	}
	payload, err := protocol.EncodeExtractorResult(value)
	if err != nil {
		return err
	}
	return c.send(ctx, payload)
}

// Results は接続が所有する認識結果のチャネルを返す。配送は受け手を待ち、受信処理の終了後に閉じる。
func (c *Recognizer) Results() <-chan protocol.RecognizerResult {
	return c.results
}
