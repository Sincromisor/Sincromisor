package rtc

import (
	"sync/atomic"
	"testing"

	"github.com/pion/webrtc/v4"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

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
	firstClient := newBrowserPeer(t)
	secondClient := newBrowserPeer(t)
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
