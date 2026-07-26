package client

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

const recognizerReadLimit int64 = 1 << 20

// Recognizer は抽出済み発話を認識結果へ変換する1 WebSocket 接続を所有する。
//
// result deliveryはunbufferedでbackpressureを保ち、terminal eventだけをbuffer 1へ保持する。
// queue、retry、他serviceとのgeneration同期は上位coordinatorへ委ねる。
type Recognizer struct {
	base    *baseClient
	results chan protocol.RecognizerResult
}

// NewRecognizer はconfigとdependencyを検証するがnetwork I/Oを開始しない。
//
// endpointと1 MiB limitはservice contractとして固定され、callerから変更できない。
func NewRecognizer(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Recognizer, error) {
	results := make(chan protocol.RecognizerResult)
	recognizer := &Recognizer{results: results}
	base, err := newBase(
		cfg, ServiceRecognizer, discovery.ServiceRecognizer, resolver, logger,
		"/api/v1/SpeechRecognizer/recognize", nil, recognizerReadLimit,
		func() { close(results) },
		func(ctx context.Context, payload []byte) error {
			value, err := protocol.DecodeRecognizerResult(payload)
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
	recognizer.base = base
	return recognizer, nil
}

// Connect はnew状態から1回だけresolve/dialし、readerとpingをconnection lifetimeへ結び付ける。
//
// 二重呼出しはErrAlreadyConnected、Closeとの競合はErrClosedで、失敗後に自動再接続しない。
func (c *Recognizer) Connect(ctx context.Context) error {
	return c.base.connect(ctx, nil)
}

// SendExtraction はvalidation済み発話区間をMessagePack binaryとして同期送信する。
//
// session、non-negative ID、16 kHz mono int16 formatを送信前に検証し、Voice sliceは保持しない。
// state別errorとwrite terminal eventは共通lifecycleから観測できる。
func (c *Recognizer) SendExtraction(ctx context.Context, value protocol.ExtractorResult) error {
	if value.SessionID != c.base.cfg.SessionID {
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
	return c.base.send(ctx, payload)
}

// Results はclient所有のunbuffered認識結果streamを返す。
func (c *Recognizer) Results() <-chan protocol.RecognizerResult {
	return c.results
}

// Events は最初の予期しないterminal failureを保持するbuffer 1 channelを返す。
func (c *Recognizer) Events() <-chan Event {
	return c.base.events
}

// Close はidempotentにconnectionと全goroutineをjoinし、result、eventの順でchannelを閉じる。
func (c *Recognizer) Close() error {
	return c.base.close()
}
