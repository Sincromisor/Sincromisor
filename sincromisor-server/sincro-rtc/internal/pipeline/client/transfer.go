package client

import (
	"context"
	"errors"
	"fmt"

	"github.com/coder/websocket"
)

// send は1 connection内の送信を直列化し、同期writeが失敗原因を確定するまでread側の終了判定を待たせる。
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

// readLoop はbinary responseをdecodeし、remote closeやprotocol違反を最初のterminal eventへ集約する。
func (c *baseClient) readLoop() {
	for {
		messageType, payload, err := c.conn.Read(c.lifetimeCtx)
		if err != nil {
			c.mu.Lock()
			writeDone := c.writeDone
			c.mu.Unlock()
			// coder/websocketはtimeoutしたWriteの復帰時にtransportを閉じ得る。
			// 同期writerに原因を先に分類させ、成功したwrite後の独立したread failureだけを処理する。
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
