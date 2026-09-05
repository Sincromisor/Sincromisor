package client

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

const synthesizerReadLimit int64 = 32 << 20

// Synthesizer は文章処理の元MessagePackデータを合成音声へ変換する接続を所有する。
// Rawを再符号化せず転送してPython側のqueryを保つ。音声の復号と再生はRTC側が担当する。
type Synthesizer struct {
	*baseClient
	results chan protocol.SynthesizerResult
}

// NewSynthesizer は設定と依存を検証し、通信前の接続を作る。
// 接続先のパスと32 MiBの上限は通信契約として固定する。
func NewSynthesizer(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Synthesizer, error) {
	results := make(chan protocol.SynthesizerResult)
	base, err := newBase(
		cfg, ServiceSynthesizer, discovery.ServiceSynthesizer, resolver, logger,
		"/api/v1/VoiceSynthesizer/synthesize", nil, synthesizerReadLimit,
		func() { close(results) },
		decodeResults(results, protocol.DecodeSynthesizerResult),
	)
	if err != nil {
		return nil, err
	}
	return &Synthesizer{baseClient: base, results: results}, nil
}

// SendResult はProcessorResult.Rawを再検証し、変更せず同期送信する。
// 空でないだけでは有効な要求と判断できないため、復号結果と入力の両方でセッションの一致を確認する。
// 不正な値は通信前に拒否し、入力は呼び出し中だけ参照する。
func (c *Synthesizer) SendResult(ctx context.Context, value protocol.ProcessorResult) error {
	if len(value.Raw) == 0 {
		return errors.New("synthesizer processor result Raw must not be empty")
	}
	decoded, err := protocol.DecodeProcessorResult(value.Raw)
	if err != nil {
		return errors.New("synthesizer processor result Raw was not successfully decoded")
	}
	if decoded.SessionID != c.cfg.SessionID || value.SessionID != decoded.SessionID {
		return errors.New("synthesizer processor result session ID does not match client")
	}
	return c.send(ctx, value.Raw)
}

// Results は接続が所有する合成音声結果のチャネルを返す。配送は受け手を待ち、受信処理の終了後に閉じる。
func (c *Synthesizer) Results() <-chan protocol.SynthesizerResult {
	return c.results
}
