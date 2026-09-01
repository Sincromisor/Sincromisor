package rtc

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
)

func TestManagerICERestartKeepsSessionPeerChannelsAndPipeline(t *testing.T) {
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
	inputObserver := inputmedia.NewCounterObserver()
	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: factory,
		InputObserver:   inputObserver,
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client := newBrowserPeer(t)
	inputTrack, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2},
		"browser-audio",
		"browser",
	)
	if err != nil {
		t.Fatalf("NewTrackLocalStaticSample() error = %v", err)
	}
	if _, err := client.AddTrack(inputTrack); err != nil {
		t.Fatalf("AddTrack(input) error = %v", err)
	}
	answer := negotiatePair(t, manager, client)
	if err := inputTrack.WriteSample(media.Sample{
		Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond,
	}); err != nil {
		t.Fatalf("WriteSample(initial) error = %v", err)
	}
	waitForCondition(t, 3*time.Second, func() bool {
		return inputObserver.Snapshot().PipelineUnavailable > 0
	})
	beforeRestartAudio := inputObserver.Snapshot().PipelineUnavailable
	select {
	case call := <-factory.calls:
		if call.sessionID != answer.SessionID {
			t.Fatalf("pipeline session = %s, want %s", call.sessionID, answer.SessionID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("pipeline did not start before ICE restart")
	}
	session := activeSession(t, manager, answer.SessionID)
	peerBefore := session.pc
	textBefore := session.lifecycle.textChannel
	telopBefore := session.lifecycle.telopChannel
	if _, err := manager.Update(context.Background(), UpdateOffer{
		SDP: "not-an-sdp", Type: "offer", TalkMode: "chat",
		SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	}); err == nil {
		t.Fatal("Manager.Update() accepted malformed pre-apply SDP")
	}
	if session.revision.current != 1 || manager.Count() != 1 {
		t.Fatalf("pre-apply failure changed revision/session = %d/%d, want 1/1",
			session.revision.current, manager.Count())
	}

	restartOffer, err := client.CreateOffer(&webrtc.OfferOptions{ICERestart: true})
	if err != nil {
		t.Fatalf("CreateOffer(ICERestart) error = %v", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(restartOffer); err != nil {
		t.Fatalf("SetLocalDescription(restart) error = %v", err)
	}
	<-gatherComplete
	restartSDP, hostIP := singleHostCandidateSDP(t, client.LocalDescription().SDP, "")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	restartAnswer, err := manager.Update(ctx, UpdateOffer{
		SDP: restartSDP, Type: "offer", TalkMode: "chat",
		SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	})
	if err != nil {
		t.Fatalf("Manager.Update() error = %v", err)
	}
	answerSDP, _ := singleHostCandidateSDP(t, restartAnswer.SDP, hostIP)
	if err := client.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer, SDP: answerSDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription(restart) error = %v", err)
	}
	waitForCondition(t, 5*time.Second, func() bool {
		return client.ConnectionState() == webrtc.PeerConnectionStateConnected
	})
	if restartAnswer.SessionID != answer.SessionID || restartAnswer.Revision != 2 {
		t.Fatalf("restart identity = %s/%d, want %s/2",
			restartAnswer.SessionID, restartAnswer.Revision, answer.SessionID)
	}
	retry, err := manager.Update(ctx, UpdateOffer{
		SDP: restartSDP, Type: "offer", TalkMode: "chat",
		SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	})
	if err != nil || retry != restartAnswer {
		t.Fatalf("completed update retry = (%+v, %v), want cached %+v", retry, err, restartAnswer)
	}
	for _, conflict := range []UpdateOffer{
		{SDP: restartSDP + " ", Type: "offer", TalkMode: "chat", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2},
		{SDP: restartSDP, Type: "offer", TalkMode: "chat", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 1},
		{SDP: restartSDP, Type: "offer", TalkMode: "chat", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 4},
		{SDP: restartSDP, Type: "offer", TalkMode: "sincro", SessionID: answer.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 3},
	} {
		if _, err := manager.Update(ctx, conflict); !errors.Is(err, ErrOfferConflict) {
			t.Fatalf("Update(conflict revision=%d mode=%s) error = %v", conflict.Revision, conflict.TalkMode, err)
		}
	}
	if manager.Count() != 1 || activeSession(t, manager, answer.SessionID) != session ||
		session.pc != peerBefore || session.lifecycle.textChannel != textBefore ||
		session.lifecycle.telopChannel != telopBefore {
		t.Fatal("ICE restart replaced session, PeerConnection, or DataChannels")
	}
	if err := inputTrack.WriteSample(media.Sample{
		Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond,
	}); err != nil {
		t.Fatalf("WriteSample(after restart) error = %v", err)
	}
	waitForCondition(t, 3*time.Second, func() bool {
		return inputObserver.Snapshot().PipelineUnavailable > beforeRestartAudio
	})
	select {
	case call := <-factory.calls:
		t.Fatalf("ICE restart created a second pipeline: %+v", call)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestUpdateFailureAfterRemoteApplyClosesWithoutCachingAnswer(t *testing.T) {
	manager := newTestManager(t)
	client := newBrowserPeer(t)
	t.Cleanup(func() {
		_ = client.Close()
		_ = manager.CloseAll(testCloseContext(t), "test_teardown")
	})
	initial := negotiatePair(t, manager, client)
	session := activeSession(t, manager, initial.SessionID)

	restartOffer, err := client.CreateOffer(&webrtc.OfferOptions{ICERestart: true})
	if err != nil {
		t.Fatalf("CreateOffer(ICERestart) error = %v", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(restartOffer); err != nil {
		t.Fatalf("SetLocalDescription(restart) error = %v", err)
	}
	<-gatherComplete
	restartSDP, _ := singleHostCandidateSDP(t, client.LocalDescription().SDP, "")
	injectedFailure := errors.New("injected answer failure after remote apply")
	session.negotiateUpdate = func(
		_ context.Context,
		offerSDP string,
	) (webrtc.SessionDescription, bool, error) {
		if err := session.pc.SetRemoteDescription(webrtc.SessionDescription{
			Type: webrtc.SDPTypeOffer,
			SDP:  offerSDP,
		}); err != nil {
			return webrtc.SessionDescription{}, false, err
		}
		return webrtc.SessionDescription{}, true, injectedFailure
	}

	if _, err := manager.Update(context.Background(), UpdateOffer{
		SDP: restartSDP, Type: "offer", TalkMode: "chat",
		SessionID: initial.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	}); !errors.Is(err, injectedFailure) {
		t.Fatalf("Manager.Update() error = %v, want injected post-apply failure", err)
	}
	waitSessionDone(t, session)
	session.lifecycle.mu.Lock()
	closeReason := session.lifecycle.closeReason
	session.lifecycle.mu.Unlock()
	if closeReason != "update_offer_partial_apply" {
		t.Fatalf("close reason = %q, want update_offer_partial_apply", closeReason)
	}
	session.revision.mu.Lock()
	current := session.revision.current
	cached := session.revision.answer
	inFlight := session.revision.updateInFlight
	session.revision.mu.Unlock()
	if current != 1 || cached != initial || inFlight {
		t.Fatalf("failed update state = revision:%d answer:%+v in_flight:%v, want initial uncached state",
			current, cached, inFlight)
	}
	if _, err := manager.Update(context.Background(), UpdateOffer{
		SDP: restartSDP, Type: "offer", TalkMode: "chat",
		SessionID: initial.SessionID, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
	}); !errors.Is(err, ErrSessionClosed) {
		t.Fatalf("retry after partial apply error = %v, want ErrSessionClosed without cached Answer", err)
	}
}
