// Package client は、既存 Python audio pipeline service への1接続単位のWebSocket I/Oを提供する。
//
// 各 client は同期送信、1 reader、ping、typed result/event channel、決定的な shutdown だけを所有する。
// reconnect、backoff、generation、4接続の一括 health 判定は上位 coordinator の責務である。
package client

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
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
	// EventPingFailed は keepalive ping が timeout または失敗したことを表す。
	EventPingFailed EventKind = "ping_failed"
	// EventReadFailed は binary 以外または一般 read failure を表す。
	EventReadFailed EventKind = "read_failed"
	// EventWriteFailed は同期 send の write failure を表す。
	EventWriteFailed EventKind = "write_failed"
	// EventDecodeFailed は binary response が service DTO として不正だったことを表す。
	EventDecodeFailed EventKind = "decode_failed"
	// EventMessageTooLarge は固定 read/write limit を超えたことを表す。
	EventMessageTooLarge EventKind = "message_too_large"
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
// ping interval=10s、ping timeout=5s、close=2sであり、read/write limit は service 固定で公開しない。
type Config struct {
	SessionID    string
	TalkMode     string
	DialTimeout  time.Duration
	WriteTimeout time.Duration
	PingInterval time.Duration
	PingTimeout  time.Duration
	CloseTimeout time.Duration
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
	lifetimeCtx context.Context
	cancel      context.CancelFunc
	connectDone chan struct{}
	done        chan struct{}
	eventOnce   sync.Once
	finalOnce   sync.Once
	sendMu      sync.Mutex
	wg          sync.WaitGroup
	events      chan Event
	closeResult func()
	decode      func(context.Context, []byte) error
}

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
	if cfg.DialTimeout <= 0 || cfg.WriteTimeout <= 0 || cfg.PingInterval <= 0 ||
		cfg.PingTimeout <= 0 || cfg.CloseTimeout <= 0 {
		return nil, errors.New("pipeline client timeouts and ping interval must be positive")
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
