package rtc

import (
	"context"
	"sync"
	"testing"

	"github.com/pion/webrtc/v4"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc/datachannel"
)

func TestSessionPublishesClosedOnlyAfterDispatcherWorkerJoin(t *testing.T) {
	dispatcher, err := datachannel.New(context.Background(), testLogger(), func(error) {})
	if err != nil {
		t.Fatalf("datachannel.New() error = %v", err)
	}
	channel := newFakeDataChannel(0)
	channel.sendEntered = make(chan struct{})
	channel.sendRelease = make(chan struct{})
	if err := dispatcher.AttachText(channel); err != nil {
		t.Fatalf("AttachText() error = %v", err)
	}
	if err := dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "blocking"}); err != nil {
		t.Fatalf("EnqueueText() error = %v", err)
	}
	<-channel.sendEntered

	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: blockingPipelineFactory{},
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	lifecycle, err := newSessionLifecycle(SystemClock{})
	if err != nil {
		t.Fatalf("newSessionLifecycle() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	session := &Session{
		id: "dispatcher-join", lifecycle: lifecycle, ctx: ctx, cancel: cancel,
		done: make(chan struct{}), logger: testLogger(), onClosed: manager.remove,
		closers: sessionResourceClosers{
			peer: func() error { return nil }, codec: func() error { return nil },
			output: func() error { return nil }, dispatcher: dispatcher.Close,
			pipeline: func() error { return nil },
		},
	}
	manager.sessions[session.id] = session
	if err := session.Close("dispatcher_join_test"); err != nil {
		t.Fatalf("Session.Close() error = %v", err)
	}
	assertCleanupPending(t, manager, session)
	close(channel.sendRelease)
	waitSessionDone(t, session)
	assertClosedSession(t, manager, session, "dispatcher_join_test")
	if got := dispatcher.Stats().ActiveWorkers; got != 0 {
		t.Fatalf("active workers at Session closed = %d, want 0", got)
	}
}

// fakeDataChannel はRTC側の結合試験でPion DataChannelの送信と通知だけを再現する。
type fakeDataChannel struct {
	mu          sync.Mutex
	buffered    uint64
	low         func()
	close       func()
	state       webrtc.DataChannelState
	sendErr     error
	sendEntered chan struct{}
	sendRelease chan struct{}
}

func newFakeDataChannel(buffered uint64) *fakeDataChannel {
	return &fakeDataChannel{buffered: buffered, state: webrtc.DataChannelStateOpen}
}

func (c *fakeDataChannel) SendText(string) error {
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
	defer c.mu.Unlock()
	return c.sendErr
}

func (c *fakeDataChannel) BufferedAmount() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buffered
}

func (c *fakeDataChannel) SetBufferedAmountLowThreshold(uint64) {}

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
