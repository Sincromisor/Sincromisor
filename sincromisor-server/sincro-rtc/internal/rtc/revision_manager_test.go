package rtc

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pion/webrtc/v4"
)

func TestManagerRejectsOldAndFutureCandidatesBeforePionApply(t *testing.T) {
	manager, session := newManagedLifecycleSession(t, &fakeClock{}, blockingPipelineFactory{})
	session.lifecycle.mu.Lock()
	session.lifecycle.state = stateRunning
	session.lifecycle.mu.Unlock()
	session.revision = newRevisionState(
		uuid.MustParse(rtcTestOfferRequestID),
		"offer-1",
		Answer{SDP: "answer-1", SessionID: session.id, Revision: 1},
	)
	applied := make(chan struct{}, 1)
	session.candidateApplier = func(webrtc.ICECandidateInit) error {
		applied <- struct{}{}
		return nil
	}
	candidate := &Candidate{Candidate: "candidate:1 1 udp 1 127.0.0.1 5000 typ host"}

	for _, revision := range []uint64{0, 2} {
		if duplicate, err := manager.AddCandidate(session.id, revision, candidate); duplicate ||
			!errors.Is(err, ErrOfferConflict) {
			t.Fatalf("AddCandidate(revision=%d) = (%v, %v), want ErrOfferConflict",
				revision, duplicate, err)
		}
	}
	select {
	case <-applied:
		t.Fatal("old/future candidate crossed the Pion apply boundary")
	default:
	}
	session.revision.mu.Lock()
	buffered := len(session.revision.candidateHashes)
	session.revision.mu.Unlock()
	if buffered != 0 {
		t.Fatalf("old/future candidates retained %d hashes, want no buffering", buffered)
	}
}

func TestUpdateAndCandidateOperationsAreSerialized(t *testing.T) {
	manager, session := newManagedLifecycleSession(t, &fakeClock{}, blockingPipelineFactory{})
	session.lifecycle.mu.Lock()
	session.lifecycle.state = stateRunning
	session.lifecycle.mu.Unlock()
	session.revision = newRevisionState(
		uuid.MustParse(rtcTestOfferRequestID),
		"offer-1",
		Answer{SDP: "answer-1", SessionID: session.id, Revision: 1},
	)
	updateEntered := make(chan struct{})
	releaseUpdate := make(chan struct{})
	session.negotiateUpdate = func(
		_ context.Context,
		_ string,
	) (webrtc.SessionDescription, bool, error) {
		close(updateEntered)
		<-releaseUpdate
		return webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: "answer-2"}, true, nil
	}
	candidateApplied := make(chan struct{})
	session.candidateApplier = func(webrtc.ICECandidateInit) error {
		close(candidateApplied)
		return nil
	}

	updateResult := make(chan error, 1)
	go func() {
		_, err := manager.Update(context.Background(), UpdateOffer{
			SDP: "offer-2", Type: "offer", TalkMode: "chat",
			SessionID: session.id, OfferRequestID: rtcTestOfferRequestID, Revision: 2,
		})
		updateResult <- err
	}()
	<-updateEntered

	candidateResult := make(chan error, 1)
	go func() {
		_, err := manager.AddCandidate(session.id, 2, nil)
		candidateResult <- err
	}()
	select {
	case <-candidateApplied:
		t.Fatal("candidate applied while update held the session operation lock")
	case err := <-candidateResult:
		t.Fatalf("candidate returned before update completed: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseUpdate)
	if err := <-updateResult; err != nil {
		t.Fatalf("Manager.Update() error = %v", err)
	}
	select {
	case <-candidateApplied:
	case <-time.After(time.Second):
		t.Fatal("candidate did not apply after update released the operation lock")
	}
	if err := <-candidateResult; err != nil {
		t.Fatalf("AddCandidate(current revision) error = %v", err)
	}
	session.revision.mu.Lock()
	current := session.revision.current
	candidateCount := len(session.revision.candidateHashes)
	session.revision.mu.Unlock()
	if current != 2 || candidateCount != 1 {
		t.Fatalf("serialized state = revision:%d candidates:%d, want 2/1", current, candidateCount)
	}
}
