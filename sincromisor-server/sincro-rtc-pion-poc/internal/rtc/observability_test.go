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
	for _, kind := range []struct {
		name   string
		stages []string
		inject func(*Session, string)
	}{
		{
			name: "goroutine",
			stages: []string{
				"rtcp_reader", "inbound_processor", "outbound_clock", "pipeline_generation",
				"pipeline_text", "pipeline_synth", "pipeline_start",
			},
			inject: func(session *Session, stage string) {
				session.Go(stage, func(_ context.Context) { panic("payload-audio-marker") })
			},
		},
		{
			name: "callback",
			stages: []string{
				"connection_state", "ice_state", "track", "data_channel", "data_channel_open",
				"deadline_pre_connect", "deadline_media_readiness",
				"deadline_disconnect_grace", "deadline_restart",
			},
			inject: func(session *Session, stage string) {
				session.SafeCallback(stage, func() { panic("payload-chat-marker") })()
			},
		},
	} {
		for _, stage := range kind.stages {
			t.Run(kind.name+"/"+stage, func(t *testing.T) {
				manager, session := newManagedLifecycleSession(t, &fakeClock{}, blockingPipelineFactory{})
				kind.inject(session, stage)
				waitSessionDone(t, session)
				assertClosedSession(t, manager, session, "panic")
			})
		}
	}
}

func TestSessionOnClosedPanicStillReleasesLifecycleAndMetrics(t *testing.T) {
	manager, session := newManagedLifecycleSession(t, &fakeClock{}, blockingPipelineFactory{})
	recorder := &recordingRTCRecorder{
		Recorder:       observability.Discard(),
		closeDurations: make(map[string]int),
	}
	session.recorder = recorder
	recorder.SessionCreated()
	session.onClosed = func(sessionID string) {
		manager.remove(sessionID)
		panic("payload-sdp-marker")
	}
	if err := session.Close("normal"); err != nil {
		t.Fatal(err)
	}
	waitSessionDone(t, session)
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if recorder.active != 0 || recorder.closed != 1 ||
		recorder.closedOutcome != "failed" || recorder.closedReason != "panic" ||
		recorder.closeDurations["success"] != 1 {
		t.Fatalf(
			"callback panic metrics active/closed/outcome/reason/duration = %d/%d/%q/%q/%v",
			recorder.active,
			recorder.closed,
			recorder.closedOutcome,
			recorder.closedReason,
			recorder.closeDurations,
		)
	}
	if manager.Count() != 0 {
		t.Fatalf("manager retained callback-panic session: %d", manager.Count())
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
	active            int
	closed            int
	closedOutcome     string
	closedReason      string
	deadlines         map[string]int
	closeDurations    map[string]int
}

func (r *recordingRTCRecorder) SessionCreated() {
	r.mu.Lock()
	r.active++
	r.mu.Unlock()
}

func (r *recordingRTCRecorder) SessionClosed(outcome, reason string) {
	r.mu.Lock()
	r.active--
	r.closed++
	r.closedOutcome = outcome
	r.closedReason = reason
	r.mu.Unlock()
}

func (r *recordingRTCRecorder) Deadline(stage string) {
	r.mu.Lock()
	if r.deadlines == nil {
		r.deadlines = make(map[string]int)
	}
	r.deadlines[stage]++
	r.mu.Unlock()
}

func (r *recordingRTCRecorder) CloseDuration(outcome string, _ time.Duration) {
	r.mu.Lock()
	if r.closeDurations == nil {
		r.closeDurations = make(map[string]int)
	}
	r.closeDurations[outcome]++
	r.mu.Unlock()
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
