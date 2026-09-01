package datachannel

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestDataChannelQueueOverflowPolicies(t *testing.T) {
	dispatcher := newDispatcherForTest(t, func(error) {})
	message := protocol.ChatMessage{MessageID: "id", Message: "text"}
	for index := 0; index < textQueueCapacity; index++ {
		if err := dispatcher.EnqueueText(message); err != nil {
			t.Fatalf("EnqueueText(%d) error = %v", index, err)
		}
	}
	if err := dispatcher.EnqueueText(message); !errors.Is(err, ErrTextQueueFull) {
		t.Fatalf("text overflow error = %v, want ErrTextQueueFull", err)
	}
	if len(dispatcher.textQueue) != textQueueCapacity {
		t.Fatalf("text queue length = %d", len(dispatcher.textQueue))
	}

	for index := 0; index <= telopQueueCapacity; index++ {
		if err := dispatcher.EnqueueTelop(audiomedia.TelopPayload{SpeechID: int64(index)}); err != nil {
			t.Fatalf("EnqueueTelop(%d) error = %v", index, err)
		}
	}
	if len(dispatcher.telopQueue) != telopQueueCapacity {
		t.Fatalf("telop queue length = %d", len(dispatcher.telopQueue))
	}
	var oldest audiomedia.TelopPayload
	if err := json.Unmarshal(dispatcher.telopQueue[0], &oldest); err != nil {
		t.Fatalf("decode oldest telop: %v", err)
	}
	if oldest.SpeechID != 1 {
		t.Fatalf("oldest retained speech_id = %d, want 1", oldest.SpeechID)
	}
}

func TestDataChannelTextJSONSchemaAndSizeBoundary(t *testing.T) {
	zero := int64(0)
	payload, err := marshalDataChannelPayload(chatMessagePayload{
		SpeechID: 1, MessageID: "m", MessageType: "assistant",
		SpeakerID: "s", SpeakerName: "name", ExpressionCode: &zero,
		Message: "body", CreatedAt: 1.5,
	})
	if err != nil {
		t.Fatalf("marshalDataChannelPayload() error = %v", err)
	}
	got := string(payload)
	for _, field := range []string{
		`"speech_id":1`, `"message_id":"m"`, `"message_type":"assistant"`,
		`"speaker_id":"s"`, `"speaker_name":"name"`, `"expression_code":0`,
		`"message":"body"`, `"created_at":1.5`,
	} {
		if !strings.Contains(got, field) {
			t.Fatalf("payload %s lacks %s", got, field)
		}
	}
	nilPayload, err := marshalDataChannelPayload(chatMessagePayload{})
	if err != nil {
		t.Fatalf("marshal nil expression: %v", err)
	}
	if strings.Contains(string(nilPayload), "expression_code") {
		t.Fatalf("nil expression_code was not omitted: %s", nilPayload)
	}

	base, err := marshalDataChannelPayload(map[string]string{"message": ""})
	if err != nil {
		t.Fatalf("marshal base: %v", err)
	}
	exactMessage := strings.Repeat("a", dataChannelPayloadLimit-len(base))
	exact, err := marshalDataChannelPayload(map[string]string{"message": exactMessage})
	if err != nil || len(exact) != dataChannelPayloadLimit {
		t.Fatalf("exact payload = %d, %v", len(exact), err)
	}
	_, err = marshalDataChannelPayload(map[string]string{"message": exactMessage + "a"})
	if !errors.Is(err, ErrDataChannelPayloadTooLarge) {
		t.Fatalf("oversize error = %v", err)
	}
}

func TestDataChannelBufferedAmountWaitsForLowWater(t *testing.T) {
	errorsSeen := make(chan error, 1)
	dispatcher := newDispatcherForTest(t, func(err error) { errorsSeen <- err })
	channel := newFakeDataChannel(bufferedAmountHigh)
	if err := dispatcher.AttachText(channel); err != nil {
		t.Fatalf("AttachText() error = %v", err)
	}
	if err := dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "m"}); err != nil {
		t.Fatalf("EnqueueText() error = %v", err)
	}
	select {
	case <-channel.sent:
		t.Fatal("payload sent above high-water")
	case <-time.After(20 * time.Millisecond):
	}
	channel.setBufferedAmount(bufferedAmountLow)
	select {
	case <-channel.sent:
	case err := <-errorsSeen:
		t.Fatalf("dispatcher error = %v", err)
	case <-time.After(time.Second):
		t.Fatal("payload was not sent after low-water")
	}
}

func TestDataChannelBackpressureTimeoutIsSessionError(t *testing.T) {
	errorsSeen := make(chan error, 1)
	dispatcher := newDispatcherForTest(t, func(err error) { errorsSeen <- err })
	dispatcher.backpressureTimeout = 10 * time.Millisecond
	channel := newFakeDataChannel(bufferedAmountHigh)
	if err := dispatcher.AttachText(channel); err != nil {
		t.Fatalf("AttachText() error = %v", err)
	}
	if err := dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "m"}); err != nil {
		t.Fatalf("EnqueueText() error = %v", err)
	}
	select {
	case err := <-errorsSeen:
		if !strings.Contains(err.Error(), "backpressure timeout") {
			t.Fatalf("timeout error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("backpressure timeout was not reported")
	}
}

func TestDataChannelSendFailurePoliciesAndClose(t *testing.T) {
	t.Run("reliable text failure", func(t *testing.T) {
		errorsSeen := make(chan error, 1)
		dispatcher := newDispatcherForTest(t, func(err error) { errorsSeen <- err })
		channel := newFakeDataChannel(0)
		channel.sendErr = errors.New("send failed")
		if err := dispatcher.AttachText(channel); err != nil {
			t.Fatalf("AttachText() error = %v", err)
		}
		if err := dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "m"}); err != nil {
			t.Fatalf("EnqueueText() error = %v", err)
		}
		select {
		case err := <-errorsSeen:
			if !strings.Contains(err.Error(), "reliable text") {
				t.Fatalf("text send error = %v", err)
			}
		case <-time.After(time.Second):
			t.Fatal("reliable text failure was not reported")
		}
	})

	t.Run("unreliable telop failure", func(t *testing.T) {
		errorsSeen := make(chan error, 1)
		dispatcher := newDispatcherForTest(t, func(err error) { errorsSeen <- err })
		channel := newFakeDataChannel(0)
		channel.sendErr = errors.New("send failed")
		if err := dispatcher.AttachTelop(channel); err != nil {
			t.Fatalf("AttachTelop() error = %v", err)
		}
		if err := dispatcher.EnqueueTelop(audiomedia.TelopPayload{SpeechID: 1}); err != nil {
			t.Fatalf("EnqueueTelop() error = %v", err)
		}
		waitForCondition(t, time.Second, func() bool {
			return dispatcher.Stats().TelopSendDropped == 1
		})
		select {
		case err := <-errorsSeen:
			t.Fatalf("unreliable telop failure ended session: %v", err)
		default:
		}
	})

	t.Run("channel close", func(t *testing.T) {
		errorsSeen := make(chan error, 1)
		dispatcher := newDispatcherForTest(t, func(err error) { errorsSeen <- err })
		channel := newFakeDataChannel(0)
		if err := dispatcher.AttachText(channel); err != nil {
			t.Fatalf("AttachText() error = %v", err)
		}
		channel.triggerClose()
		select {
		case err := <-errorsSeen:
			if !strings.Contains(err.Error(), "closed") {
				t.Fatalf("channel close error = %v", err)
			}
		case <-time.After(time.Second):
			t.Fatal("channel close was not reported")
		}
	})
}

func TestDataChannelGenerationPurgeInterruptsBackpressureWait(t *testing.T) {
	errorsSeen := make(chan error, 1)
	dispatcher := newDispatcherForTest(t, func(err error) { errorsSeen <- err })
	dispatcher.backpressureTimeout = 20 * time.Millisecond
	channel := newFakeDataChannel(bufferedAmountHigh)
	if err := dispatcher.AttachText(channel); err != nil {
		t.Fatalf("AttachText() error = %v", err)
	}
	if err := dispatcher.EnqueueText(protocol.ChatMessage{MessageID: "old"}); err != nil {
		t.Fatalf("EnqueueText() error = %v", err)
	}
	select {
	case <-channel.bufferChecked:
	case <-time.After(time.Second):
		t.Fatal("worker did not enter backpressure check")
	}
	dispatcher.Purge()
	select {
	case err := <-errorsSeen:
		t.Fatalf("purged in-flight event caused session error: %v", err)
	case <-time.After(2 * dispatcher.backpressureTimeout):
	}
	select {
	case payload := <-channel.sent:
		t.Fatalf("purged event was sent: %s", payload)
	default:
	}
}

func TestDataChannelAttachAndCloseShareWorkerReservation(t *testing.T) {
	t.Run("attach wins reservation and close joins worker", func(t *testing.T) {
		dispatcher := newDispatcherForTest(t, func(error) {})
		channel := newFakeDataChannel(0)
		channel.thresholdEntered = make(chan struct{})
		channel.thresholdRelease = make(chan struct{})
		attachDone := make(chan error, 1)
		go func() { attachDone <- dispatcher.AttachText(channel) }()
		<-channel.thresholdEntered

		closeDone := make(chan error, 1)
		go func() { closeDone <- dispatcher.Close() }()
		select {
		case err := <-closeDone:
			t.Fatalf("Close returned before attach reservation completed: %v", err)
		default:
		}
		close(channel.thresholdRelease)
		if err := <-attachDone; err != nil {
			t.Fatalf("AttachText() error = %v", err)
		}
		if err := <-closeDone; err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if got := dispatcher.Stats().ActiveWorkers; got != 0 {
			t.Fatalf("active workers after Close = %d, want 0", got)
		}
	})

	t.Run("close wins and later attach is rejected", func(t *testing.T) {
		dispatcher := newDispatcherForTest(t, func(error) {})
		if err := dispatcher.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		err := dispatcher.AttachText(newFakeDataChannel(0))
		if !errors.Is(err, ErrDataChannelDispatcherClosed) {
			t.Fatalf("AttachText() error = %v, want dispatcher closed", err)
		}
		if got := dispatcher.Stats().ActiveWorkers; got != 0 {
			t.Fatalf("active workers = %d, want 0", got)
		}
	})
}

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
