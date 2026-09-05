// Package client は、既存 Python audio pipeline service への1接続単位のWebSocket I/Oを提供する。
//
// 各 client は同期送信、1 reader、typed result/event channel、決定的な shutdown だけを所有する。
// reconnect、backoff、generation、4接続の一括 health 判定は上位 coordinator の責務である。
package client

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/url"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

// Service は health event の発生元を識別する。
type Service string

const (
	// ServiceExtractor は discovery.ServiceExtractor と同じ wire service 名である。
	ServiceExtractor Service = Service(discovery.ServiceExtractor)
	// ServiceRecognizer は discovery.ServiceRecognizer と同じ wire service 名である。
	ServiceRecognizer Service = Service(discovery.ServiceRecognizer)
	// ServiceProcessor は discovery.ServiceProcessor と同じ wire service 名である。
	ServiceProcessor Service = Service(discovery.ServiceProcessor)
	// ServiceSynthesizer は discovery.ServiceSynthesizer と同じ wire service 名である。
	ServiceSynthesizer Service = Service(discovery.ServiceSynthesizer)
)

// EventKind は予期しない connection terminal failure の分類である。
type EventKind string

const (
	// EventRemoteClose は peer が close frame を送ったことを表す。
	EventRemoteClose EventKind = "remote_close"
	// EventReadFailed は binary 以外または一般 read failure を表す。
	EventReadFailed EventKind = "read_failed"
	// EventWriteFailed は同期 send の write failure を表す。
	EventWriteFailed EventKind = "write_failed"
	// EventDecodeFailed は binary response が service DTO として不正だったことを表す。
	EventDecodeFailed EventKind = "decode_failed"
	// EventMessageTooLarge は固定 read/write limit を超えたことを表す。
	EventMessageTooLarge EventKind = "message_too_large"
	// EventPanic はfirst-party connection workerのpanicをpayloadなしで分類する。
	EventPanic EventKind = "panic"
)

// Event は最初の予期しない terminal failure を caller へ通知する。
//
// Err は payload、credential、response body を含まない診断用 error である。明示 Close と
// parent context cancellation では Event は生成されず、Events channel の close だけで完了を通知する。
type Event struct {
	Service Service
	Kind    EventKind
	Err     error
}

// Config は1つの session connection に共通する validation 済み設定である。
//
// duration は test で短縮できるよう正数を受ける。production 既定値は dial=5s、write=5s、
// close=2sであり、read/write limit は service 固定で公開しない。
type Config struct {
	SessionID    string
	TalkMode     string
	DialTimeout  time.Duration
	WriteTimeout time.Duration
	CloseTimeout time.Duration
}

// production既定値はDefaultConfigだけが組み立て、各constructorはtest overrideを含め正数か検証する。
const (
	defaultDialTimeout  = 5 * time.Second
	defaultWriteTimeout = 5 * time.Second
	defaultCloseTimeout = 2 * time.Second
)

// DefaultConfig はproduction接続用のtimeout正本を設定したConfigを返す。
//
// session IDとtalk modeのdomain validationは各service constructorが行う。testは返却値の正数durationを
// 明示overrideできるが、zero/負数はconstructorで拒否される。
func DefaultConfig(sessionID, talkMode string) Config {
	return Config{
		SessionID:    sessionID,
		TalkMode:     talkMode,
		DialTimeout:  defaultDialTimeout,
		WriteTimeout: defaultWriteTimeout,
		CloseTimeout: defaultCloseTimeout,
	}
}

// ErrAlreadyConnected は Connect が new 以外の接続済み lifecycle で呼ばれたことを表す。
var ErrAlreadyConnected = errors.New("pipeline client already connected")

// ErrNotConnected は send が new または connecting で呼ばれたことを表す。
var ErrNotConnected = errors.New("pipeline client not connected")

// ErrClosed は Close または terminal failure 後の Connect/send を表す。
var ErrClosed = errors.New("pipeline client closed")

type lifecycleState uint8

const (
	stateNew lifecycleState = iota
	stateConnecting
	stateOpen
	stateClosed
)

// baseClient は各サービスに共通の接続状態、送受信処理、終了通知を所有する。
// サービス固有の型と入力検証は埋め込み側が持ち、結果チャネルの終了だけcloseResultへ委ねる。
type baseClient struct {
	cfg       Config
	service   Service
	discovery discovery.Service
	resolver  discovery.Resolver
	logger    *slog.Logger
	path      string
	query     url.Values
	readLimit int64

	mu          sync.Mutex
	state       lifecycleState
	intentional bool
	conn        *websocket.Conn
	// rawConn はclose handshake timeout時にlibraryの固定waitを中断するtransport socketである。
	// baseClientだけが参照し、通常closeはwebsocket.Conn、timeout時だけshutdown flowが直接closeする。
	rawConn net.Conn
	// reason: Connectのparent cancellationをreader/finalizerへ同じconnection lifetimeとして伝播するため。 / 解消条件: library APIが接続scope contextを各operationへ保存なしで提供した場合。
	lifetimeCtx context.Context
	cancel      context.CancelFunc
	connectDone chan struct{}
	done        chan struct{}
	eventOnce   sync.Once
	finalOnce   sync.Once
	sendMu      sync.Mutex
	writeDone   chan struct{}
	wg          sync.WaitGroup
	events      chan Event
	closeResult func()
	decode      func(context.Context, []byte) error
}

// Events は最初の予期しない接続失敗を1件保持する、接続所有のチャネルを返す。
// 明示終了と親コンテキストの中断ではイベントを送らず、結果チャネルの終了後に閉じる。
func (c *baseClient) Events() <-chan Event {
	return c.events
}

// newBase は設定と依存を検証して未接続の値を作り、通信は開始しない。
// decodeは受信処理から呼び、closeResultは受信処理の終了後に一度だけ呼ぶ。
func newBase(
	cfg Config,
	service Service,
	discoveryService discovery.Service,
	resolver discovery.Resolver,
	logger *slog.Logger,
	path string,
	query url.Values,
	readLimit int64,
	closeResult func(),
	decode func(context.Context, []byte) error,
) (*baseClient, error) {
	if resolver == nil {
		return nil, errors.New("pipeline client resolver must not be nil")
	}
	if logger == nil {
		return nil, errors.New("pipeline client logger must not be nil")
	}
	if cfg.SessionID == "" {
		return nil, errors.New("pipeline client session ID must not be empty")
	}
	if cfg.DialTimeout <= 0 || cfg.WriteTimeout <= 0 || cfg.CloseTimeout <= 0 {
		return nil, errors.New("pipeline client timeouts must be positive")
	}
	return &baseClient{
		cfg:         cfg,
		service:     service,
		discovery:   discoveryService,
		resolver:    resolver,
		logger:      logger,
		path:        path,
		query:       query,
		readLimit:   readLimit,
		state:       stateNew,
		done:        make(chan struct{}),
		events:      make(chan Event, 1),
		closeResult: closeResult,
		decode:      decode,
	}, nil
}
