package datachannel

import (
	"errors"
	"strings"
	"testing"
	"time"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

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
