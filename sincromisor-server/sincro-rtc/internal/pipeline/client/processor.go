package client

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

const processorReadLimit int64 = 2 << 20

// Processor は認識requestをchat/sincro応答へ変換する1 WebSocket 接続を所有する。
//
// talk modeはconstructorでendpointへ固定され、result.Rawはdecoder所有のcopyとしてSynthesizerへ渡せる。
// client自身はchat historyやpipeline orchestrationを保持しない。
type Processor struct {
	base    *baseClient
	results chan protocol.ProcessorResult
}

// NewProcessor はtalk mode、config、dependencyを検証するがnetwork I/Oを開始しない。
//
// chat/sincro以外を拒否し、modeとURLがconnection lifetime中に乖離しない固定pathを生成する。
func NewProcessor(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Processor, error) {
	if cfg.TalkMode != "chat" && cfg.TalkMode != "sincro" {
		return nil, errors.New("processor talk mode must be chat or sincro")
	}
	results := make(chan protocol.ProcessorResult)
	processor := &Processor{results: results}
	base, err := newBase(
		cfg, ServiceProcessor, discovery.ServiceProcessor, resolver, logger,
		"/api/v1/TextProcessor/"+cfg.TalkMode, nil, processorReadLimit,
		func() { close(results) },
		func(ctx context.Context, payload []byte) error {
			value, err := protocol.DecodeProcessorResult(payload)
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
	processor.base = base
	return processor, nil
}

// Connect はnew状態から1回だけresolve/dialし、readerをconnection lifetimeへ結び付ける。
func (c *Processor) Connect(ctx context.Context) error {
	return c.base.connect(ctx, nil)
}

// SendRequest はclient sessionと一致するProcessorRequestをMessagePack binaryとして同期送信する。
//
// history sliceはencode中だけ参照しqueueへ保持しない。nil historyなどprotocol encode error、
// state別error、write terminal eventはcallerへ返すかEventsで通知する。
func (c *Processor) SendRequest(ctx context.Context, value protocol.ProcessorRequest) error {
	if value.SessionID != c.base.cfg.SessionID {
		return errors.New("processor request session ID does not match client")
	}
	payload, err := protocol.EncodeProcessorRequest(value)
	if err != nil {
		return err
	}
	return c.base.send(ctx, payload)
}

// Results はclient所有のunbufferedprocessor result streamを返す。
//
// 各resultのRawは受信payloadの防御的copyであり、consumerが次段へそのまま渡せる。
func (c *Processor) Results() <-chan protocol.ProcessorResult {
	return c.results
}

// Events は最初の予期しないterminal failureを保持するbuffer 1 channelを返す。
func (c *Processor) Events() <-chan Event {
	return c.base.events
}

// Close はidempotentにconnectionと全goroutineをjoinし、result、eventの順でchannelを閉じる。
func (c *Processor) Close() error {
	return c.base.close()
}
