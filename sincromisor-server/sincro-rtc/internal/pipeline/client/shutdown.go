package client

import (
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/coder/websocket"
)

// terminal はreader/sync writerの競合をclosedへの1回のstate transitionへ集約する。
// 最初のeventをbufferへ置いてからlifetimeをcancelするため、finalizeによるchannel closeが通知を追い越さない。
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

// Close は接続を再利用不能にし、明示終了のイベントを送らずに全処理の終了を待つ。
// 接続前や重複した呼び出しでも使用できる。接続確立中は探索と接続を中断する。
// 終了応答が設定時間を超えた場合はソケットを直接閉じ、受信処理、結果、イベントの順で回収する。
func (c *baseClient) Close() error {
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
		rawConn := c.rawConn
		cancel := c.cancel
		c.mu.Unlock()
		err := closeHandshake(conn, rawConn, c.cfg.CloseTimeout)
		cancel()
		<-c.done
		return err
	default:
		c.mu.Unlock()
		return nil
	}
}

// closeHandshake は通常handshakeを試し、configured timeout時だけcaptured transportを直接閉じる。
// timeout branchもClose goroutineの結果を必ず受けるため、callerへ戻った時点でhelperは残っていない。
func closeHandshake(conn *websocket.Conn, rawConn net.Conn, timeout time.Duration) error {
	result := make(chan error, 1)
	go func() {
		defer func() {
			if recover() != nil {
				result <- errors.New("websocket close helper panic")
			}
		}()
		result <- conn.Close(websocket.StatusNormalClosure, "")
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case err := <-result:
		return err
	case <-timer.C:
		forceErr := rawConn.Close()
		// underlying socketを先に中断すると、libraryの固定5秒waitは即座に解除される。
		// resultを必ず受けることでClose helperをjoinし、force-close競合errorは正常shutdownとして隠す。
		<-result
		if forceErr != nil && !errors.Is(forceErr, net.ErrClosed) {
			return fmt.Errorf("force close websocket transport: %w", forceErr)
		}
		return nil
	}
}

// finalizeWhenCanceled は親の中断または接続失敗を受けてソケットを閉じ、受信処理の終了を待つ。
// その後のfinalizeがdoneを閉じるまで、Closeは終了完了を返さない。
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
