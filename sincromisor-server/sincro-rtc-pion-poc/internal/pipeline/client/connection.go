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
	"time"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

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
	c.wg.Add(2)
	go c.readLoop()
	go c.pingLoop()
	go c.finalizeWhenCanceled()
	c.mu.Unlock()
	return nil
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
			"service", c.service, "reason", endpoint.FallbackReason)
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

func (c *baseClient) failConnect(cancel context.CancelFunc) bool {
	cancel()
	c.mu.Lock()
	wasClosed := c.state == stateClosed
	c.state = stateClosed
	c.mu.Unlock()
	c.finalize()
	return wasClosed
}

func (c *baseClient) send(ctx context.Context, payload []byte) error {
	c.mu.Lock()
	state := c.state
	conn := c.conn
	lifetimeCtx := c.lifetimeCtx
	c.mu.Unlock()
	switch state {
	case stateClosed:
		return ErrClosed
	case stateOpen:
	default:
		return ErrNotConnected
	}
	if int64(len(payload)) > c.readLimit {
		err := errors.New("outbound message exceeds service limit")
		c.terminal(EventMessageTooLarge, err)
		return err
	}

	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	c.mu.Lock()
	if c.state != stateOpen || c.conn != conn {
		c.mu.Unlock()
		return ErrClosed
	}
	writeDone := make(chan struct{})
	c.writeDone = writeDone
	c.mu.Unlock()
	writeCtx, cancel := context.WithTimeout(ctx, c.cfg.WriteTimeout)
	err := conn.Write(writeCtx, websocket.MessageBinary, payload)
	cancel()
	if err != nil {
		if lifetimeCtx.Err() != nil {
			c.finishWrite(writeDone)
			return ErrClosed
		}
		c.terminal(EventWriteFailed, fmt.Errorf("write binary message: %w", err))
		c.finishWrite(writeDone)
		return err
	}
	c.finishWrite(writeDone)
	return nil
}

func (c *baseClient) finishWrite(done chan struct{}) {
	c.mu.Lock()
	c.writeDone = nil
	close(done)
	c.mu.Unlock()
}

func (c *baseClient) readLoop() {
	defer c.wg.Done()
	for {
		messageType, payload, err := c.conn.Read(c.lifetimeCtx)
		if err != nil {
			c.mu.Lock()
			writeDone := c.writeDone
			c.mu.Unlock()
			// coder/websocket may close the transport as a timed-out Write returns.
			// Let the synchronous writer classify that causal failure first; an
			// unrelated read failure still proceeds when the successful write ends.
			if writeDone != nil {
				<-writeDone
			}
			if c.lifetimeCtx.Err() != nil {
				return
			}
			kind := EventReadFailed
			switch status := websocket.CloseStatus(err); {
			case errors.Is(err, websocket.ErrMessageTooBig):
				kind = EventMessageTooLarge
			case status != -1:
				kind = EventRemoteClose
			}
			c.terminal(kind, fmt.Errorf("read binary message: %w", err))
			return
		}
		if messageType != websocket.MessageBinary {
			c.terminal(EventReadFailed, errors.New("received non-binary websocket message"))
			return
		}
		if err := c.decode(c.lifetimeCtx, payload); err != nil {
			if c.lifetimeCtx.Err() != nil {
				return
			}
			c.terminal(EventDecodeFailed, fmt.Errorf("decode service response: %w", err))
			return
		}
	}
}

func (c *baseClient) pingLoop() {
	defer c.wg.Done()
	ticker := time.NewTicker(c.cfg.PingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-c.lifetimeCtx.Done():
			return
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(c.lifetimeCtx, c.cfg.PingTimeout)
			err := c.conn.Ping(pingCtx)
			cancel()
			if err != nil {
				if c.lifetimeCtx.Err() == nil {
					c.terminal(EventPingFailed, fmt.Errorf("ping service: %w", err))
				}
				return
			}
		}
	}
}
