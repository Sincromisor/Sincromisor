package client

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"sync"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

// Connect は初期化メッセージが不要なサービスの探索と接続を一度だけ行う。
// 受信処理はctxの中断またはCloseで停止する。再接続はせず、重複呼び出しには
// ErrAlreadyConnected、終了済みの接続にはErrClosedを返す。
func (c *baseClient) Connect(ctx context.Context) error {
	return c.connect(ctx, nil)
}

// connect は new→connecting→open の一方向遷移と、connection lifetime goroutine を開始する。
// resolver/dial 中の Close は保存した cancel と connectDone で割り込み、確立済み socket を残さない。
func (c *baseClient) connect(ctx context.Context, initialize func() ([]byte, error)) error {
	c.mu.Lock()
	switch c.state {
	case stateNew:
		c.state = stateConnecting
	case stateClosed:
		c.mu.Unlock()
		return ErrClosed
	default:
		c.mu.Unlock()
		return ErrAlreadyConnected
	}
	lifetimeCtx, cancel := context.WithCancel(ctx)
	connectDone := make(chan struct{})
	c.lifetimeCtx = lifetimeCtx
	c.cancel = cancel
	c.connectDone = connectDone
	c.mu.Unlock()
	defer close(connectDone)

	conn, rawConn, err := c.establish(lifetimeCtx, initialize)
	if err != nil {
		if c.failConnect(cancel) {
			return ErrClosed
		}
		return err
	}

	c.mu.Lock()
	if c.state == stateClosed || lifetimeCtx.Err() != nil {
		c.mu.Unlock()
		_ = conn.CloseNow()
		c.finalize()
		return ErrClosed
	}
	c.conn = conn
	c.rawConn = rawConn
	c.state = stateOpen
	c.wg.Add(1)
	c.goWorker("read", true, c.readLoop)
	c.goWorker("finalize", false, c.finalizeWhenCanceled)
	c.mu.Unlock()
	return nil
}

// goWorker は接続に属する処理を開始し、panicを接続失敗として通知する。
// 受信処理は呼び出し前にwgへ予約し、終了処理は受信処理を待ってdoneを閉じることで完了を知らせる。
func (c *baseClient) goWorker(stage string, counted bool, run func()) {
	go func() {
		if counted {
			defer c.wg.Done()
		}
		defer func() {
			if recover() != nil {
				c.terminal(EventPanic, fmt.Errorf("%s worker panic", stage))
			}
		}()
		run()
	}()
}

// establish は lifecycle state lock を保持せず、resolve→dial→read limit→初期化writeを完了する。
// 外部I/O中のCloseはlifetimeCtxをcancelし、callerのconnectが確立途中socketとchannelを収束させる。
func (c *baseClient) establish(
	lifetimeCtx context.Context,
	initialize func() ([]byte, error),
) (*websocket.Conn, net.Conn, error) {
	var initialPayload []byte
	if initialize != nil {
		var err error
		initialPayload, err = initialize()
		if err != nil {
			return nil, nil, fmt.Errorf("encode %s initialization: %w", c.service, err)
		}
	}
	endpoint, err := c.resolver.Resolve(lifetimeCtx, c.discovery)
	if err != nil {
		return nil, nil, fmt.Errorf("resolve %s endpoint: %w", c.service, err)
	}
	if endpoint.Source == discovery.EndpointSourceFallback {
		c.logger.Warn("pipeline service discovery fell back",
			"stage", c.service, "reason", endpoint.FallbackReason)
	}

	dialURL := url.URL{
		Scheme:   "ws",
		Host:     net.JoinHostPort(endpoint.Host, strconv.Itoa(int(endpoint.Port))),
		Path:     c.path,
		RawQuery: c.query.Encode(),
	}
	dialCtx, dialCancel := context.WithTimeout(lifetimeCtx, c.cfg.DialTimeout)
	conn, rawConn, err := dialWebSocket(dialCtx, dialURL.String())
	dialCancel()
	if err != nil {
		return nil, nil, fmt.Errorf("dial %s websocket: %w", c.service, err)
	}
	conn.SetReadLimit(c.readLimit)

	if len(initialPayload) > 0 {
		if int64(len(initialPayload)) > c.readLimit {
			_ = conn.CloseNow()
			return nil, nil, fmt.Errorf("initialize %s websocket: payload exceeds service limit", c.service)
		}
		writeCtx, writeCancel := context.WithTimeout(lifetimeCtx, c.cfg.WriteTimeout)
		err = conn.Write(writeCtx, websocket.MessageBinary, initialPayload)
		writeCancel()
		if err != nil {
			_ = conn.CloseNow()
			return nil, nil, fmt.Errorf("initialize %s websocket: %w", c.service, err)
		}
	}
	return conn, rawConn, nil
}

// dialWebSocket はHTTP upgradeに使われるunderlying socketをWebSocketと対で返す。
// configured close timeout時はlibraryの同時Close semanticsを経由せず、このsocketを直接中断する。
func dialWebSocket(ctx context.Context, target string) (*websocket.Conn, net.Conn, error) {
	defaultTransport, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return nil, nil, errors.New("pipeline websocket default HTTP transport is unsupported")
	}
	transport := defaultTransport.Clone()
	dialer := &net.Dialer{}
	var captureMu sync.Mutex
	var rawConn net.Conn
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		conn, err := dialer.DialContext(ctx, network, address)
		if err == nil {
			captureMu.Lock()
			rawConn = conn
			captureMu.Unlock()
		}
		return conn, err
	}
	httpClient := &http.Client{
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("pipeline websocket redirect rejected")
		},
	}
	conn, _, err := websocket.Dial(ctx, target, &websocket.DialOptions{HTTPClient: httpClient})
	if err != nil {
		return nil, nil, err
	}
	captureMu.Lock()
	defer captureMu.Unlock()
	if rawConn == nil {
		_ = conn.CloseNow()
		return nil, nil, errors.New("pipeline websocket underlying connection was not captured")
	}
	return conn, rawConn, nil
}

// failConnect は接続失敗を終了済みに確定し、受信処理が始まる前のチャネルを回収する。
// 戻り値は明示終了が先行したかを示し、呼び出し側がErrClosedへ変換するために使う。
func (c *baseClient) failConnect(cancel context.CancelFunc) bool {
	cancel()
	c.mu.Lock()
	wasClosed := c.state == stateClosed
	c.state = stateClosed
	c.mu.Unlock()
	c.finalize()
	return wasClosed
}
