package rtc

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

const rtcTestOfferRequestID = "8e0e18a9-243b-4c72-8e97-a1b103854e42"

func TestManagerConnectionDataChannelsAndClose(t *testing.T) {
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 1)}
	manager := newTestManagerWithFactory(t, factory)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client, _ := newBrowserPeer(t)
	answer := negotiatePair(t, manager, client)
	if manager.Count() != 1 {
		t.Fatalf("Count() = %d, want 1 after offer", manager.Count())
	}
	if manager.reservations != 0 {
		t.Fatalf("reservations = %d, want 0 after Session publication", manager.reservations)
	}
	if answer.SessionID == "" {
		t.Fatal("Create() returned empty session ID")
	}
	duplicate, err := manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if err != nil || duplicate {
		t.Fatalf("AddCandidate(end-of-candidates) = (%v, %v), want applied", duplicate, err)
	}
	duplicate, err = manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if err != nil || !duplicate {
		t.Fatalf("AddCandidate(duplicate end-of-candidates) = (%v, %v), want duplicate", duplicate, err)
	}

	session := activeSession(t, manager, answer.SessionID)
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
	waitForRemoteSessionClose(t, manager, answer.SessionID, session)
	if manager.Count() != 0 {
		t.Fatalf("Count() = %d, want 0 after close", manager.Count())
	}
	assertNoPipelineCall(t, factory)
	duplicate, err = manager.AddCandidate(answer.SessionID, answer.Revision, nil)
	if duplicate || !errors.Is(err, ErrSessionClosed) {
		t.Fatalf("closed candidate = (%v, %v), want ErrSessionClosed", duplicate, err)
	}
}

func TestManagerInboundEOFClosesSessionAndRemovesRegistryEntry(t *testing.T) {
	manager := newTestManager(t)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client, _ := newBrowserPeer(t)
	t.Cleanup(func() { _ = client.Close() })
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
	session := activeSession(t, manager, answer.SessionID)
	if err := inputTrack.WriteSample(media.Sample{
		Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond,
	}); err != nil {
		t.Fatalf("WriteSample(input) error = %v", err)
	}
	waitForCondition(t, 3*time.Second, func() bool {
		session.lifecycle.mu.Lock()
		defer session.lifecycle.mu.Unlock()
		return session.lifecycle.audio != nil
	})
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
	waitForRemoteSessionClose(t, manager, answer.SessionID, session)
}

func TestInboundEOFClosesSessionNormally(t *testing.T) {
	manager, session := newManagedLifecycleSession(t, SystemClock{}, blockingPipelineFactory{})
	session.wg.Add(1)
	session.startInbound(&singlePacketReader{})
	waitSessionDone(t, session)
	if session.lifecycle.closeReason != "normal" {
		t.Fatalf("close reason = %q, want normal", session.lifecycle.closeReason)
	}
	if manager.Count() != 0 {
		t.Fatalf("registry Count() = %d, want 0", manager.Count())
	}
}

func TestManagerTenSequentialNormalClosesConverge(t *testing.T) {
	baseline := runtime.NumGoroutine()
	manager := newTestManager(t)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	for attempt := 1; attempt <= 10; attempt++ {
		client, _ := newBrowserPeer(t)
		answer := negotiatePair(t, manager, client)
		session := activeSession(t, manager, answer.SessionID)
		if err := client.Close(); err != nil {
			t.Fatalf("attempt %d client.Close() error = %v", attempt, err)
		}
		waitForRemoteSessionClose(t, manager, answer.SessionID, session)
		if manager.Count() != 0 {
			t.Fatalf("attempt %d Count() = %d, want 0", attempt, manager.Count())
		}
	}
	waitForCondition(t, 3*time.Second, func() bool {
		return runtime.NumGoroutine() <= baseline+5
	})
}

func TestManagerICERestartKeepsSessionPeerChannelsAndPipeline(t *testing.T) {
	factory := &recordingBlockingFactory{calls: make(chan pipelineStart, 2)}
	inputObserver := audiomedia.NewInputCounterObserver()
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
	client, _ := newBrowserPeer(t)
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
	client, _ := newBrowserPeer(t)
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

func TestSessionCloseIsIdempotent(t *testing.T) {
	manager := newTestManager(t)
	client, _ := newBrowserPeer(t)
	answer := negotiatePair(t, manager, client)

	manager.mu.RLock()
	session := manager.sessions[answer.SessionID]
	manager.mu.RUnlock()
	if session == nil {
		t.Fatal("session missing after negotiation")
	}
	var wait sync.WaitGroup
	for range 100 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if err := session.Close("concurrent_close"); err != nil {
				t.Errorf("Close() error = %v", err)
			}
		}()
	}
	wait.Wait()
	<-session.done
	if manager.Count() != 0 {
		t.Fatalf("Count() = %d, want 0", manager.Count())
	}
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
}

func TestCodecErrorClosesSession(t *testing.T) {
	closed := make(chan string, 1)
	coordinator, err := pipeline.NewCoordinator(blockingPipelineFactory{}, testLogger())
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	session, err := newSession(
		"codec-error-session",
		"chat",
		webrtc.Configuration{},
		0,
		coordinator,
		testSynthDecoder(t),
		testInputObserver(),
		SystemClock{},
		testLogger(),
		func(sessionID string) { closed <- sessionID },
		nil,
	)
	if err != nil {
		t.Fatalf("newSession() error = %v", err)
	}
	session.wg.Add(1)
	session.startInbound(&singlePacketReader{packet: &rtp.Packet{Payload: []byte{0xff}}})
	select {
	case sessionID := <-closed:
		if sessionID != "codec-error-session" {
			t.Fatalf("closed session = %q, want codec-error-session", sessionID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("codec error did not close session")
	}
}

func TestSessionsShareNonOwnedSynthDecoder(t *testing.T) {
	decoder := testSynthDecoder(t)
	create := func(id string) *Session {
		t.Helper()
		coordinator, err := pipeline.NewCoordinator(blockingPipelineFactory{}, testLogger())
		if err != nil {
			t.Fatalf("NewCoordinator() error = %v", err)
		}
		session, err := newSession(
			id,
			"chat",
			webrtc.Configuration{},
			0,
			coordinator,
			decoder,
			testInputObserver(),
			SystemClock{},
			testLogger(),
			func(string) {},
			nil,
		)
		if err != nil {
			t.Fatalf("newSession(%s) error = %v", id, err)
		}
		return session
	}
	first := create("shared-decoder-first")
	second := create("shared-decoder-second")
	if first.synthDecoder != decoder || second.synthDecoder != decoder ||
		first.synthDecoder != second.synthDecoder {
		t.Fatal("newSession did not preserve the process-wide Decoder pointer")
	}
	if err := first.Close("test"); err != nil {
		t.Fatalf("first.Close() error = %v", err)
	}
	<-first.done
	if second.synthDecoder != decoder {
		t.Fatal("closing one Session changed another Session Decoder reference")
	}
	if err := second.Close("test"); err != nil {
		t.Fatalf("second.Close() error = %v", err)
	}
	<-second.done
}

func TestManagerPropagatesSharedSynthDecoderAndCleanupKeepsItNonOwned(t *testing.T) {
	manager := newTestManager(t)
	decoder := manager.config.SynthDecoder
	originalBuilder := manager.buildSession
	var requests []*synthdecode.Decoder
	manager.buildSession = func(request sessionBuildRequest) (*Session, error) {
		requests = append(requests, request.synthDecoder)
		session, err := originalBuilder(request)
		if err == nil && session.synthDecoder != request.synthDecoder {
			t.Fatalf("newSession Decoder = %p, request Decoder %p", session.synthDecoder, request.synthDecoder)
		}
		return session, err
	}
	firstClient, _ := newBrowserPeer(t)
	secondClient, _ := newBrowserPeer(t)
	firstAnswer := negotiatePair(t, manager, firstClient)
	secondAnswer := negotiatePair(t, manager, secondClient)
	first := activeSession(t, manager, firstAnswer.SessionID)
	second := activeSession(t, manager, secondAnswer.SessionID)
	if len(requests) != 2 {
		t.Fatalf("sessionBuildRequest count = %d, want 2", len(requests))
	}
	for index, requestDecoder := range requests {
		if requestDecoder != decoder {
			t.Fatalf("sessionBuildRequest[%d] Decoder = %p, ManagerConfig Decoder %p",
				index, requestDecoder, decoder)
		}
	}
	if first.synthDecoder != decoder || second.synthDecoder != decoder {
		t.Fatal("ManagerConfig -> sessionBuildRequest -> newSession -> Session changed Decoder pointer")
	}

	// 所有する3 resourceだけをwrapperで数え、Decoderがcleanup集合へ紛れ込まないことを固定する。
	originalClosers := first.closers
	var closerCalls atomic.Int32
	first.closers = sessionResourceClosers{
		peer: func() error {
			closerCalls.Add(1)
			return originalClosers.peer()
		},
		codec: func() error {
			closerCalls.Add(1)
			return originalClosers.codec()
		},
		pipeline: func() error {
			closerCalls.Add(1)
			return originalClosers.pipeline()
		},
	}
	if err := first.Close("decoder_ownership_test"); err != nil {
		t.Fatalf("first.Close() error = %v", err)
	}
	<-first.done
	if closerCalls.Load() != 3 {
		t.Fatalf("Session cleanup closer calls = %d, want exactly peer/codec/pipeline", closerCalls.Load())
	}
	if second.synthDecoder != decoder {
		t.Fatal("closing first Session changed second Session Decoder reference")
	}
	if err := second.Close("test_teardown"); err != nil {
		t.Fatalf("second.Close() error = %v", err)
	}
	<-second.done
	if err := firstClient.Close(); err != nil {
		t.Errorf("first client.Close() error = %v", err)
	}
	if err := secondClient.Close(); err != nil {
		t.Errorf("second client.Close() error = %v", err)
	}
}

func TestNewSessionRejectsNilSynthDecoderBeforeResourceCreation(t *testing.T) {
	coordinator, err := pipeline.NewCoordinator(blockingPipelineFactory{}, testLogger())
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	defer func() { _ = coordinator.Close() }()
	session, err := newSession(
		"nil-decoder",
		"chat",
		webrtc.Configuration{},
		0,
		coordinator,
		nil,
		panicRTCInputObserver{},
		SystemClock{},
		testLogger(),
		func(string) {},
		nil,
	)
	if err == nil || session != nil {
		t.Fatalf("newSession(nil Decoder) = %#v, %v; want pre-resource validation error", session, err)
	}
}

func TestInputObserverPanicClosesAndJoinsSession(t *testing.T) {
	closed := make(chan string, 1)
	coordinator, err := pipeline.NewCoordinator(blockingPipelineFactory{}, testLogger())
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	session, err := newSession(
		"observer-panic-session",
		"chat",
		webrtc.Configuration{},
		0,
		coordinator,
		testSynthDecoder(t),
		panicRTCInputObserver{},
		SystemClock{},
		testLogger(),
		func(sessionID string) { closed <- sessionID },
		nil,
	)
	if err != nil {
		t.Fatalf("newSession() error = %v", err)
	}
	session.wg.Add(1)
	session.startInbound(&singlePacketReader{packet: &rtp.Packet{
		Header: rtp.Header{SSRC: 1},
	}})
	select {
	case sessionID := <-closed:
		if sessionID != "observer-panic-session" {
			t.Fatalf("closed session = %q, want observer-panic-session", sessionID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("observer panic did not close and join session")
	}
	<-session.done
}

func newTestManager(t *testing.T) *Manager {
	t.Helper()
	return newTestManagerWithFactory(t, blockingPipelineFactory{})
}

func newTestManagerWithFactory(t *testing.T, factory pipeline.ClientSetFactory) *Manager {
	t.Helper()
	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: factory,
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     100,
		SynthDecoder:    testSynthDecoder(t),
	})
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	return manager
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func testCloseContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}

type blockingPipelineFactory struct{}

type panicRTCInputObserver struct{}

func (panicRTCInputObserver) ObserveInputEvent(audiomedia.InputEvent) {
	panic("observer failed")
}

func (blockingPipelineFactory) Connect(
	ctx context.Context,
	_, _ string,
) (pipeline.ClientSet, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func newBrowserPeer(t *testing.T) (*webrtc.PeerConnection, <-chan channelMessage) {
	t.Helper()
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection() error = %v", err)
	}
	if _, err := client.AddTransceiverFromKind(
		webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		t.Fatalf("AddTransceiverFromKind() error = %v", err)
	}
	messages := make(chan channelMessage, 2)
	text, err := client.CreateDataChannel(textChannelLabel, &webrtc.DataChannelInit{Ordered: boolPointer(true)})
	if err != nil {
		t.Fatalf("CreateDataChannel(text) error = %v", err)
	}
	ordered := false
	retransmits := uint16(0)
	telop, err := client.CreateDataChannel(telopChannelLabel, &webrtc.DataChannelInit{
		Ordered:        &ordered,
		MaxRetransmits: &retransmits,
	})
	if err != nil {
		t.Fatalf("CreateDataChannel(telop) error = %v", err)
	}
	for _, channel := range []*webrtc.DataChannel{text, telop} {
		channel := channel
		channel.OnMessage(func(message webrtc.DataChannelMessage) {
			messages <- channelMessage{label: channel.Label(), payload: string(message.Data)}
		})
	}
	client.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		go func() {
			for {
				if _, _, err := track.ReadRTP(); err != nil {
					return
				}
			}
		}()
	})
	return client, messages
}

func negotiatePair(t *testing.T, manager *Manager, client *webrtc.PeerConnection) Answer {
	t.Helper()
	offer, err := client.CreateOffer(nil)
	if err != nil {
		t.Fatalf("CreateOffer() error = %v", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(offer); err != nil {
		t.Fatalf("SetLocalDescription() error = %v", err)
	}
	<-gatherComplete
	local := client.LocalDescription()
	if local == nil {
		t.Fatal("client local description is nil")
	}
	// 同一host内のtestでは、Docker/Tailscaleを含む全interfaceのcandidate pairを評価する必要がない。
	// 両peerに存在する先頭IPv4 host candidateへ絞り、到達不能IPv6 pairの探索量がrace detectorの
	// 5秒deadlineを左右しないようにする。productionのcandidate収集契約は変更しない。
	offerSDP, hostIP := singleHostCandidateSDP(t, local.SDP, "")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	answer, err := manager.Create(ctx, Offer{
		SDP: offerSDP, Type: "offer", TalkMode: "chat",
		OfferRequestID: rtcTestOfferRequestID,
	})
	if err != nil {
		t.Fatalf("Manager.Create() error = %v", err)
	}
	answerSDP, _ := singleHostCandidateSDP(t, answer.SDP, hostIP)
	if err := client.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  answerSDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription() error = %v", err)
	}
	waitForCondition(t, 5*time.Second, func() bool {
		return client.ConnectionState() == webrtc.PeerConnectionStateConnected
	})
	return answer
}

func singleHostCandidateSDP(t *testing.T, description, hostIP string) (string, string) {
	t.Helper()
	lines := strings.Split(description, "\n")
	if hostIP == "" {
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) >= 8 &&
				strings.HasPrefix(fields[0], "a=candidate:") &&
				fields[7] == "host" &&
				net.ParseIP(fields[4]).To4() != nil {
				hostIP = fields[4]
				break
			}
		}
	}
	if hostIP == "" {
		t.Fatal("SDP has no IPv4 host candidate for local peer test")
	}
	filtered := make([]string, 0, len(lines))
	kept := 0
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 5 && strings.HasPrefix(fields[0], "a=candidate:") {
			if fields[4] != hostIP {
				continue
			}
			kept++
		}
		filtered = append(filtered, line)
	}
	if kept == 0 {
		t.Fatalf("SDP has no host candidate for selected local address %s", hostIP)
	}
	return strings.Join(filtered, "\n"), hostIP
}

type channelMessage struct {
	label   string
	payload string
}

func waitForMessages(t *testing.T, messages <-chan channelMessage, want map[string]string) {
	t.Helper()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for len(want) != 0 {
		select {
		case message := <-messages:
			wantPayload, ok := want[message.label]
			if !ok {
				t.Fatalf("unexpected channel message: %+v", message)
			}
			if message.payload != wantPayload {
				t.Fatalf("%s payload = %q, want %q", message.label, message.payload, wantPayload)
			}
			delete(want, message.label)
		case <-timer.C:
			t.Fatalf("timed out waiting for channel messages: %v", want)
		}
	}
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

func activeSession(t *testing.T, manager *Manager, sessionID string) *Session {
	t.Helper()
	manager.mu.RLock()
	session := manager.sessions[sessionID]
	manager.mu.RUnlock()
	if session == nil {
		t.Fatalf("session %q missing before client close", sessionID)
	}
	return session
}

func waitForRemoteSessionClose(t *testing.T, manager *Manager, sessionID string, session *Session) {
	t.Helper()
	select {
	case <-session.done:
	case <-time.After(3 * time.Second):
		t.Fatalf("session %q did not close from remote event", sessionID)
	}
	if manager.Count() != 0 {
		t.Fatalf("session %q done but registry count = %d, want 0", sessionID, manager.Count())
	}
}

func boolPointer(value bool) *bool {
	return &value
}

type singlePacketReader struct {
	packet *rtp.Packet
}

func (r *singlePacketReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	if r.packet == nil {
		return nil, nil, io.EOF
	}
	packet := r.packet
	r.packet = nil
	return packet, nil, nil
}
