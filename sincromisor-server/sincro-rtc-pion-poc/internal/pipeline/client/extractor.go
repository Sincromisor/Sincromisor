package client

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"strconv"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

const (
	extractorReadLimit int64 = 2 << 20
	pcmFrameBytes            = 640
)

// Extractor は raw 16 kHz mono s16le frame を発話区間へ変換する1 WebSocket 接続を所有する。
//
// zero value は無効であり NewExtractor で生成する。結果 channel は unbuffered、event channel は
// buffer 1で、clientが両方のclose ownerである。再接続と複数serviceのhealth判断は行わない。
type Extractor struct {
	base    *baseClient
	results chan protocol.ExtractorResult
	now     func() time.Time
}

// NewExtractor は talk mode、timeout、dependency を検証するが network I/O は開始しない。
//
// now は Connect ごとの初期化時刻を1回だけ取得するため必須である。chat は1000ms、sincro は600msの
// fixed silence queryへ写像され、その他の mode は endpoint を構築する前に拒否される。
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
	extractor := &Extractor{results: results, now: now}
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
		func(ctx context.Context, payload []byte) error {
			value, err := protocol.DecodeExtractorResult(payload)
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
	extractor.base = base
	return extractor, nil
}

// Connect は discovery、dial、初期化binary送信を行い、reader/ping goroutineを開始する。
//
// 初期化は最初のapplication messageとして1件だけ送られ、StartAt は encode 直前の now の Unix秒である。
// new以外は ErrAlreadyConnected、Closeと競合してclosedになった場合は ErrClosedを返す。
func (c *Extractor) Connect(ctx context.Context) error {
	return c.base.connect(ctx, func() ([]byte, error) {
		initialize := protocol.ExtractorInitialize{
			SessionID:         c.base.cfg.SessionID,
			StartAt:           float64(c.now().UnixNano()) / float64(time.Second),
			VoiceSamplingRate: 16_000,
			VoiceSampleBytes:  2,
			VoiceChannels:     1,
		}
		return protocol.EncodeExtractorInitialize(initialize)
	})
}

// SendPCM は20ms相当の16 kHz mono s16le raw frameを同期binary送信する。
//
// frameは呼び出し中だけ参照し、queueやownership transferを行わない。空、奇数長、640 byte以外は
// connectionへ触れず拒否し、stateに応じて ErrNotConnected / ErrClosed を返す。
func (c *Extractor) SendPCM(ctx context.Context, frame []byte) error {
	if len(frame) == 0 || len(frame)%2 != 0 || len(frame) != pcmFrameBytes {
		return errors.New("extractor PCM frame must be exactly 640 even bytes")
	}
	return c.base.send(ctx, frame)
}

// Results は client 所有のunbuffered発話区間streamを返す。
//
// consumerが停止してもCloseまたはparent cancellationでreaderは解除され、cleanup時にchannelが閉じる。
func (c *Extractor) Results() <-chan protocol.ExtractorResult {
	return c.results
}

// Events は最初の予期しないterminal failureを保持するbuffer 1 channelを返す。
//
// 明示Closeとparent cancellationはeventを送らず、cleanup完了後にchannelだけを閉じる。
func (c *Extractor) Events() <-chan Event {
	return c.base.events
}

// Close は connectionを再利用不能なclosedへ遷移し、handshake、cancel、goroutine join、channel closeへ収束する。
//
// Close-before-Connectを含めidempotentであり、retryや新しいgenerationは開始しない。
func (c *Extractor) Close() error {
	return c.base.close()
}

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
