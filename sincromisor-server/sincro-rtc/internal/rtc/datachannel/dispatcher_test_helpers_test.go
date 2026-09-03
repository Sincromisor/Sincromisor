package datachannel

import (
	"context"
	"io"
	"log/slog"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

// newDispatcherForTest は破棄ログを捨て、各試験終了時に処理担当を確実に待ち合わせる。
func newDispatcherForTest(t *testing.T, onError func(error)) *Dispatcher {
	t.Helper()
	dispatcher, err := New(context.Background(), slog.New(slog.NewTextHandler(io.Discard, nil)), onError)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() {
		if err := dispatcher.Close(); err != nil {
			t.Errorf("Close() error = %v", err)
		}
	})
	return dispatcher
}

// waitForCondition は非同期の観測値が期限内に成立するまで実行権を譲る。
func waitForCondition(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		runtime.Gosched()
	}
	t.Fatal("condition did not become true before deadline")
}

// fakeDataChannel は送信抑制、終了通知、送信競合に必要なPion境界だけを再現する。
type fakeDataChannel struct {
	mu               sync.Mutex
	buffered         uint64
	low              func()
	close            func()
	state            webrtc.DataChannelState
	sent             chan string
	sendErr          error
	bufferChecked    chan struct{}
	thresholdEntered chan struct{}
	thresholdRelease chan struct{}
	sendEntered      chan struct{}
	sendRelease      chan struct{}
}

func newFakeDataChannel(buffered uint64) *fakeDataChannel {
	return &fakeDataChannel{
		buffered: buffered, state: webrtc.DataChannelStateOpen, sent: make(chan string, 1),
		bufferChecked: make(chan struct{}, 1),
	}
}

func (c *fakeDataChannel) SendText(value string) error {
	if c.sendEntered != nil {
		select {
		case <-c.sendEntered:
		default:
			close(c.sendEntered)
		}
	}
	if c.sendRelease != nil {
		<-c.sendRelease
	}
	c.mu.Lock()
	err := c.sendErr
	c.mu.Unlock()
	if err != nil {
		return err
	}
	c.sent <- value
	return nil
}

func (c *fakeDataChannel) BufferedAmount() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	select {
	case c.bufferChecked <- struct{}{}:
	default:
	}
	return c.buffered
}

func (c *fakeDataChannel) SetBufferedAmountLowThreshold(uint64) {
	if c.thresholdEntered != nil {
		close(c.thresholdEntered)
	}
	if c.thresholdRelease != nil {
		<-c.thresholdRelease
	}
}

func (c *fakeDataChannel) OnBufferedAmountLow(callback func()) {
	c.mu.Lock()
	c.low = callback
	c.mu.Unlock()
}

func (c *fakeDataChannel) OnClose(callback func()) {
	c.mu.Lock()
	c.close = callback
	c.mu.Unlock()
}

func (c *fakeDataChannel) ReadyState() webrtc.DataChannelState {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.state
}

func (c *fakeDataChannel) setBufferedAmount(value uint64) {
	c.mu.Lock()
	c.buffered = value
	low := c.low
	c.mu.Unlock()
	if low != nil {
		low()
	}
}

func (c *fakeDataChannel) triggerClose() {
	c.mu.Lock()
	c.state = webrtc.DataChannelStateClosed
	closeCallback := c.close
	c.mu.Unlock()
	if closeCallback != nil {
		closeCallback()
	}
}
