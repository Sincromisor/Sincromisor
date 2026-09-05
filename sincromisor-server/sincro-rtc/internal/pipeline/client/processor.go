package client

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

const processorReadLimit int64 = 2 << 20

// Processor は認識結果をchatまたはsincroの応答へ変換する接続を所有する。
// 会話モードは構築時に接続先へ固定する。会話履歴の管理は上位のCoordinatorが担当する。
type Processor struct {
	*baseClient
	results chan protocol.ProcessorResult
}

// NewProcessor は会話モード、設定、依存を検証し、通信前の接続を作る。
// chatとsincro以外を拒否し、接続中に会話モードと接続先が変わらないようにする。
func NewProcessor(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Processor, error) {
	if cfg.TalkMode != "chat" && cfg.TalkMode != "sincro" {
		return nil, errors.New("processor talk mode must be chat or sincro")
	}
	results := make(chan protocol.ProcessorResult)
	base, err := newBase(
		cfg, ServiceProcessor, discovery.ServiceProcessor, resolver, logger,
		"/api/v1/TextProcessor/"+cfg.TalkMode, nil, processorReadLimit,
		func() { close(results) },
		decodeResults(results, protocol.DecodeProcessorResult),
	)
	if err != nil {
		return nil, err
	}
	return &Processor{baseClient: base, results: results}, nil
}

// SendRequest はセッションが一致するProcessorRequestをMessagePackで同期送信する。
// 履歴は符号化中だけ参照する。nilの履歴などの検証失敗と接続・送信の失敗は呼び出し側へ返す。
func (c *Processor) SendRequest(ctx context.Context, value protocol.ProcessorRequest) error {
	if value.SessionID != c.cfg.SessionID {
		return errors.New("processor request session ID does not match client")
	}
	payload, err := protocol.EncodeProcessorRequest(value)
	if err != nil {
		return err
	}
	return c.send(ctx, payload)
}

// Results は接続が所有する文章処理結果のチャネルを返す。配送は受け手を待ち、受信処理の終了後に閉じる。
// 各結果のRawは受信データから独立したコピーであり、次の合成処理へそのまま渡せる。
func (c *Processor) Results() <-chan protocol.ProcessorResult {
	return c.results
}
