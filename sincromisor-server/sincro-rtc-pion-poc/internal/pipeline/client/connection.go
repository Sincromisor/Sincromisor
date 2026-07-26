package client

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
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

	conn, err := c.establish(lifetimeCtx, initialize)
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
) (*websocket.Conn, error) {
	var initialPayload []byte
	if initialize != nil {
		var err error
		initialPayload, err = initialize()
		if err != nil {
			return nil, fmt.Errorf("encode %s initialization: %w", c.service, err)
		}
	}
	endpoint, err := c.resolver.Resolve(lifetimeCtx, c.discovery)
	if err != nil {
		return nil, fmt.Errorf("resolve %s endpoint: %w", c.service, err)
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
	conn, _, err := websocket.Dial(dialCtx, dialURL.String(), nil)
	dialCancel()
	if err != nil {
		return nil, fmt.Errorf("dial %s websocket: %w", c.service, err)
	}
	conn.SetReadLimit(c.readLimit)

	if len(initialPayload) > 0 {
		if int64(len(initialPayload)) > c.readLimit {
			_ = conn.CloseNow()
			return nil, fmt.Errorf("initialize %s websocket: payload exceeds service limit", c.service)
		}
		writeCtx, writeCancel := context.WithTimeout(lifetimeCtx, c.cfg.WriteTimeout)
		err = conn.Write(writeCtx, websocket.MessageBinary, initialPayload)
		writeCancel()
		if err != nil {
			_ = conn.CloseNow()
			return nil, fmt.Errorf("initialize %s websocket: %w", c.service, err)
		}
	}
	return conn, nil
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
	c.mu.Unlock()
	writeCtx, cancel := context.WithTimeout(ctx, c.cfg.WriteTimeout)
	defer cancel()
	err := conn.Write(writeCtx, websocket.MessageBinary, payload)
	if err != nil {
		if lifetimeCtx.Err() != nil {
			return ErrClosed
		}
		c.terminal(EventWriteFailed, fmt.Errorf("write binary message: %w", err))
		return err
	}
	return nil
}

func (c *baseClient) readLoop() {
	defer c.wg.Done()
	for {
		messageType, payload, err := c.conn.Read(c.lifetimeCtx)
		if err != nil {
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

func (c *baseClient) terminal(kind EventKind, err error) {
	c.mu.Lock()
	if c.state == stateClosed || c.intentional {
		c.mu.Unlock()
		return
	}
	c.state = stateClosed
	cancel := c.cancel
	c.eventOnce.Do(func() {
		c.events <- Event{Service: c.service, Kind: kind, Err: err}
	})
	c.mu.Unlock()
	cancel()
}

// close は明示 shutdown を terminal event なしで実行する。
// close handshake は設定時間を越えたら CloseNow へ切り替え、helper 自体の終了も待ってから goroutine を join する。
func (c *baseClient) close() error {
	c.mu.Lock()
	switch c.state {
	case stateClosed:
		done := c.done
		connectDone := c.connectDone
		c.mu.Unlock()
		if connectDone != nil {
			<-connectDone
		}
		<-done
		return nil
	case stateNew:
		c.state = stateClosed
		c.intentional = true
		c.mu.Unlock()
		c.finalize()
		return nil
	case stateConnecting:
		c.state = stateClosed
		c.intentional = true
		cancel := c.cancel
		connectDone := c.connectDone
		c.mu.Unlock()
		cancel()
		<-connectDone
		<-c.done
		return nil
	case stateOpen:
		c.state = stateClosed
		c.intentional = true
		conn := c.conn
		cancel := c.cancel
		c.mu.Unlock()
		err := closeHandshake(conn, c.cfg.CloseTimeout)
		cancel()
		<-c.done
		return err
	default:
		c.mu.Unlock()
		return nil
	}
}

func closeHandshake(conn *websocket.Conn, timeout time.Duration) error {
	result := make(chan error, 1)
	go func() {
		result <- conn.Close(websocket.StatusNormalClosure, "")
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case err := <-result:
		return err
	case <-timer.C:
		closeNowErr := conn.CloseNow()
		// CloseNowで中断されたhandshake errorはfallbackの想定結果である。
		// resultを必ず受けることでhelperをjoinし、force close自体のerrorだけをcallerへ返す。
		<-result
		return closeNowErr
	}
}

func (c *baseClient) finalizeWhenCanceled() {
	<-c.lifetimeCtx.Done()
	c.mu.Lock()
	c.state = stateClosed
	c.mu.Unlock()
	_ = c.conn.CloseNow()
	c.wg.Wait()
	c.finalize()
}

// finalize は result、event の順に owner channel を1回だけ閉じる。
// reader が unbuffered result delivery で停止していても lifetime cancellation が select を解除する。
func (c *baseClient) finalize() {
	c.finalOnce.Do(func() {
		c.closeResult()
		close(c.events)
		close(c.done)
	})
}
