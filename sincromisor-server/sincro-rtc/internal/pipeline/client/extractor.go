package client

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"strconv"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

const (
	extractorReadLimit int64 = 2 << 20
	pcmFrameBytes            = 640
)

// Extractor は16 kHz・モノラル・s16leのPCMを発話区間へ変換する接続を所有する。
// NewExtractorで生成し、Connectで開始する。結果は受け手を待って配送し、終了はbaseClientが管理する。
type Extractor struct {
	*baseClient
	results chan protocol.ExtractorResult
	now     func() time.Time
}

// NewExtractor は会話モード、期限、依存を検証し、通信前の接続を作る。
// nowは初期化時刻の取得に必須である。無音の区切りはchatで1000 ms、sincroで600 msとし、他のモードを拒否する。
func NewExtractor(
	cfg Config,
	resolver discovery.Resolver,
	logger *slog.Logger,
	now func() time.Time,
) (*Extractor, error) {
	if now == nil {
		return nil, errors.New("extractor clock must not be nil")
	}
	maxSilence, err := maxSilenceMilliseconds(cfg.TalkMode)
	if err != nil {
		return nil, err
	}
	results := make(chan protocol.ExtractorResult)
	base, err := newBase(
		cfg,
		ServiceExtractor,
		discovery.ServiceExtractor,
		resolver,
		logger,
		"/api/v1/SpeechExtractor/extract",
		url.Values{"max_silence_ms": {strconv.Itoa(maxSilence)}},
		extractorReadLimit,
		func() { close(results) },
		decodeResults(results, protocol.DecodeExtractorResult),
	)
	if err != nil {
		return nil, err
	}
	return &Extractor{baseClient: base, results: results, now: now}, nil
}

// Connect は探索、接続、初期化メッセージの送信を済ませて受信処理を開始する。
// 初期化は最初のメッセージとして一度だけ送り、StartAtはnowから取得するUnix秒である。
// 重複呼び出しはErrAlreadyConnected、Closeとの競合で終了済みの場合はErrClosedを返す。
func (c *Extractor) Connect(ctx context.Context) error {
	return c.connect(ctx, func() ([]byte, error) {
		initialize := protocol.ExtractorInitialize{
			SessionID:         c.cfg.SessionID,
			StartAt:           float64(c.now().UnixNano()) / float64(time.Second),
			VoiceSamplingRate: 16_000,
			VoiceSampleBytes:  2,
			VoiceChannels:     1,
		}
		return protocol.EncodeExtractorInitialize(initialize)
	})
}

// SendPCM は20 ms相当の640バイトのPCMを同期送信する。
// 入力は呼び出し中だけ参照する。長さが異なる値は通信前に拒否し、未接続または終了済みなら
// ErrNotConnectedまたはErrClosedを返す。
func (c *Extractor) SendPCM(ctx context.Context, frame []byte) error {
	if len(frame) != pcmFrameBytes {
		return errors.New("extractor PCM frame must be exactly 640 even bytes")
	}
	return c.send(ctx, frame)
}

// Results は接続が所有する発話区間のチャネルを返す。
// 配送は受け手を待ち、Closeまたは親コンテキストの中断で解除される。受信処理の終了後に閉じる。
func (c *Extractor) Results() <-chan protocol.ExtractorResult {
	return c.results
}

// maxSilenceMilliseconds は会話モードを発話区間の無音期限へ変換し、未対応のモードを拒否する。
func maxSilenceMilliseconds(talkMode string) (int, error) {
	switch talkMode {
	case "chat":
		return 1000, nil
	case "sincro":
		return 600, nil
	default:
		return 0, errors.New("extractor talk mode must be chat or sincro")
	}
}
