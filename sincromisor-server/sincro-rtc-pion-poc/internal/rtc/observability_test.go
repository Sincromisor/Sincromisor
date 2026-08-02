package rtc

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/pion/rtcp"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

func TestRTCPClassificationQualityAndUnknownFeedback(t *testing.T) {
	recorder := &recordingRTCRecorder{Recorder: observability.Discard()}
	session := &Session{recorder: recorder}
	now := time.Unix(1_700_000_000, 0)
	middle := ntpMiddle32(now)
	session.recordRTCPPackets([]rtcp.Packet{
		&rtcp.SenderReport{},
		&rtcp.ReceiverReport{Reports: []rtcp.ReceptionReport{{
			FractionLost: 128, LastSenderReport: middle - 65536, Delay: 32768,
		}}},
		&rtcp.TransportLayerNack{},
		&rtcp.PictureLossIndication{},
	}, now)
	if recorder.feedback["sr"] != 1 || recorder.feedback["rr"] != 1 ||
		recorder.feedback["nack"] != 1 || recorder.feedback["other"] != 1 {
		t.Fatalf("feedback counts = %#v", recorder.feedback)
	}
	if recorder.loss != .5 || recorder.rtt != .5 {
		t.Fatalf("quality = loss %v rtt %v, want .5/.5", recorder.loss, recorder.rtt)
	}
}

func TestDataChannelWorkerMetricsAndPanicBoundary(t *testing.T) {
	recorder := &recordingRTCRecorder{Recorder: observability.Discard()}
	recovered := make(chan string, 1)
	dispatcher, err := NewDataChannelDispatcher(
		context.Background(), testLogger(), func(error) {},
		DataChannelDispatcherOptions{
			Recorder:     recorder,
			RecoverPanic: func(stage string) { recovered <- stage },
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	defer dispatcher.Close()
	channel := &panicDataChannel{fakeDataChannel: newFakeDataChannel(0)}
	if err := dispatcher.AttachText(channel); err != nil {
		t.Fatal(err)
	}
	if err := dispatcher.EnqueueText(protocol.ChatMessage{Message: "payload-chat-marker"}); err != nil {
		t.Fatal(err)
	}
	select {
	case stage := <-recovered:
		if stage != "data_channel_worker" {
			t.Fatalf("panic stage = %q", stage)
		}
	case <-time.After(time.Second):
		t.Fatal("data channel worker panic was not recovered")
	}
	if depth := recorder.queueDepthValue("text"); depth != 0 {
		t.Fatalf("text queue ownership = %v, want 0", depth)
	}

	errorChannel := newFakeDataChannel(0)
	errorChannel.sendErr = errors.New("payload-candidate-marker")
	dispatcher2, err := NewDataChannelDispatcher(
		context.Background(), testLogger(), func(error) {},
		DataChannelDispatcherOptions{Recorder: recorder},
	)
	if err != nil {
		t.Fatal(err)
	}
	defer dispatcher2.Close()
	if err := dispatcher2.AttachText(errorChannel); err != nil {
		t.Fatal(err)
	}
	if err := dispatcher2.EnqueueText(protocol.ChatMessage{Message: "payload-chat-marker"}); err != nil {
		t.Fatal(err)
	}
	waitForCondition(t, time.Second, func() bool { return recorder.dataErrors() == 1 })
}

func TestSessionRecoverWrappersConvergeOnCloseOnce(t *testing.T) {
	for _, test := range []struct {
		name   string
		inject func(*Session)
	}{
		{name: "goroutine", inject: func(session *Session) {
			session.Go("panic_test_goroutine", func(_ context.Context) { panic("payload-audio-marker") })
		}},
		{name: "callback", inject: func(session *Session) {
			session.SafeCallback("panic_test_callback", func() { panic("payload-chat-marker") })()
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			manager, session := newManagedLifecycleSession(t, &fakeClock{}, blockingPipelineFactory{})
			test.inject(session)
			waitSessionDone(t, session)
			assertClosedSession(t, manager, session, "panic")
		})
	}
}

type recordingRTCRecorder struct {
	observability.Recorder
	mu                sync.Mutex
	feedback          map[string]int
	loss              float64
	rtt               float64
	queueDepth        map[string]float64
	dataChannelErrors int
}

func (r *recordingRTCRecorder) QueueDepthDelta(queue string, delta float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.queueDepth == nil {
		r.queueDepth = make(map[string]float64)
	}
	r.queueDepth[queue] += delta
}

func (r *recordingRTCRecorder) DataChannelError(string) {
	r.mu.Lock()
	r.dataChannelErrors++
	r.mu.Unlock()
}

func (r *recordingRTCRecorder) queueDepthValue(queue string) float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.queueDepth[queue]
}

func (r *recordingRTCRecorder) dataErrors() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.dataChannelErrors
}

type panicDataChannel struct{ *fakeDataChannel }

func (*panicDataChannel) SendText(string) error { panic("payload-audio-marker") }

func (r *recordingRTCRecorder) RTCPFeedback(kind string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.feedback == nil {
		r.feedback = make(map[string]int)
	}
	r.feedback[kind]++
}

func (r *recordingRTCRecorder) RTCPQuality(loss, rtt float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.loss, r.rtt = loss, rtt
}
