package client

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

const synthesizerReadLimit int64 = 32 << 20

// Synthesizer はprocessorの元MessagePack bytesを合成音声へ変換する1 WebSocket 接続を所有する。
//
// ProcessorResultを再encodeせずRawを転送することでPython query fieldを保持する。音声decode後の
// container処理や再生、retry、pipeline orchestrationはこのclientの責務ではない。
type Synthesizer struct {
	base    *baseClient
	results chan protocol.SynthesizerResult
}

// NewSynthesizer はconfigとdependencyを検証するがnetwork I/Oを開始しない。
//
// endpointと32 MiB limitはservice contractとして固定され、callerから変更できない。
func NewSynthesizer(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Synthesizer, error) {
	results := make(chan protocol.SynthesizerResult)
	synthesizer := &Synthesizer{results: results}
	base, err := newBase(
		cfg, ServiceSynthesizer, discovery.ServiceSynthesizer, resolver, logger,
		"/api/v1/VoiceSynthesizer/synthesize", nil, synthesizerReadLimit,
		func() { close(results) },
		func(ctx context.Context, payload []byte) error {
			value, err := protocol.DecodeSynthesizerResult(payload)
			if err != nil {
				return err
			}
			select {
			case results <- value:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		},
	)
	if err != nil {
		return nil, err
	}
	synthesizer.base = base
	return synthesizer, nil
}

// Connect はnew状態から1回だけresolve/dialし、readerをconnection lifetimeへ結び付ける。
func (c *Synthesizer) Connect(ctx context.Context) error {
	return c.base.connect(ctx, nil)
}

// SendResult はdecode成功済みProcessorResult.Rawを変更せず同期binary送信する。
//
// Raw非空だけではdecode成功を証明しないためDecodeProcessorResultを再実行し、session一致もdecoded値から
// 検証する。invalid値はsocketへ触れず、payload sliceは呼び出し中だけ参照して保持しない。
func (c *Synthesizer) SendResult(ctx context.Context, value protocol.ProcessorResult) error {
	if len(value.Raw) == 0 {
		return errors.New("synthesizer processor result Raw must not be empty")
	}
	decoded, err := protocol.DecodeProcessorResult(value.Raw)
	if err != nil {
		return errors.New("synthesizer processor result Raw was not successfully decoded")
	}
	if decoded.SessionID != c.base.cfg.SessionID || value.SessionID != decoded.SessionID {
		return errors.New("synthesizer processor result session ID does not match client")
	}
	return c.base.send(ctx, value.Raw)
}

// Results はclient所有のunbuffered合成音声result streamを返す。
func (c *Synthesizer) Results() <-chan protocol.SynthesizerResult {
	return c.results
}

// Events は最初の予期しないterminal failureを保持するbuffer 1 channelを返す。
func (c *Synthesizer) Events() <-chan Event {
	return c.base.events
}

// Close はidempotentにconnectionと全goroutineをjoinし、result、eventの順でchannelを閉じる。
func (c *Synthesizer) Close() error {
	return c.base.close()
}
