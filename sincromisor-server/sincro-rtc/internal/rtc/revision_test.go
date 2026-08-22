package rtc

import (
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"
)

func TestRevisionUpdateIdentityAndRetry(t *testing.T) {
	requestID := uuid.MustParse(rtcTestOfferRequestID)
	initial := Answer{SDP: "answer-1", SessionID: "session", Revision: 1}
	state := newRevisionState(requestID, "offer-1", initial)

	tests := []struct {
		name     string
		request  uuid.UUID
		revision uint64
		sdp      string
		want     Answer
		proceed  bool
		wantErr  error
	}{
		{name: "completed retry", request: requestID, revision: 1, sdp: "offer-1", want: initial},
		{name: "same revision different sdp", request: requestID, revision: 1, sdp: "changed", wantErr: ErrOfferConflict},
		{name: "zero", request: requestID, revision: 0, sdp: "offer-0", wantErr: ErrOfferConflict},
		{name: "future skip", request: requestID, revision: 3, sdp: "offer-3", wantErr: ErrOfferConflict},
		{name: "different request id", request: uuid.New(), revision: 2, sdp: "offer-2", wantErr: ErrOfferConflict},
		{name: "strict next", request: requestID, revision: 2, sdp: "offer-2", proceed: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, proceed, err := state.beginUpdate(test.request, test.revision, test.sdp)
			if !errors.Is(err, test.wantErr) || proceed != test.proceed || got != test.want {
				t.Fatalf("beginUpdate() = (%+v, %v, %v), want (%+v, %v, %v)",
					got, proceed, err, test.want, test.proceed, test.wantErr)
			}
			if proceed {
				if _, _, err := state.beginUpdate(requestID, 2, "offer-2"); !errors.Is(err, ErrOfferConflict) {
					t.Fatalf("parallel beginUpdate() error = %v, want ErrOfferConflict", err)
				}
				state.finishUpdate(2, "offer-2", Answer{}, false)
			}
		})
	}
	if state.current != 1 {
		t.Fatalf("failed update advanced revision to %d", state.current)
	}
}

func TestRevisionCandidateDedupeAndLimit(t *testing.T) {
	state := newRevisionState(
		uuid.MustParse(rtcTestOfferRequestID),
		"offer",
		Answer{Revision: 1},
	)
	applied := 0
	apply := func() error {
		applied++
		return nil
	}
	if duplicate, err := state.addCandidate(1, nil, apply); err != nil || duplicate {
		t.Fatalf("first null candidate = (%v, %v)", duplicate, err)
	}
	if duplicate, err := state.addCandidate(1, nil, apply); err != nil || !duplicate {
		t.Fatalf("duplicate null candidate = (%v, %v)", duplicate, err)
	}
	if applied != 1 {
		t.Fatalf("null candidate applied %d times, want 1", applied)
	}

	mid := "0"
	withMissingOptional := &Candidate{Candidate: "candidate:base"}
	withNullOptional := &Candidate{Candidate: "candidate:base", SDPMid: nil}
	if candidateHash(withMissingOptional) != candidateHash(withNullOptional) {
		t.Fatal("missing/null optional fields must canonicalize identically")
	}
	withEmptyOptional := &Candidate{Candidate: "candidate:base", SDPMid: new(string)}
	withValueOptional := &Candidate{Candidate: "candidate:base", SDPMid: &mid}
	if candidateHash(withMissingOptional) == candidateHash(withEmptyOptional) ||
		candidateHash(withEmptyOptional) == candidateHash(withValueOptional) {
		t.Fatal("present optional string values must remain distinct from missing and each other")
	}

	for index := 1; index < maxCandidatesPerRevision; index++ {
		candidate := &Candidate{Candidate: fmt.Sprintf("candidate:%d", index)}
		if duplicate, err := state.addCandidate(1, candidate, apply); err != nil || duplicate {
			t.Fatalf("candidate %d = (%v, %v)", index, duplicate, err)
		}
	}
	if duplicate, err := state.addCandidate(1, &Candidate{Candidate: "candidate:65"}, apply); duplicate ||
		!errors.Is(err, ErrCandidateLimit) {
		t.Fatalf("65th distinct candidate = (%v, %v), want ErrCandidateLimit", duplicate, err)
	}
	if duplicate, err := state.addCandidate(0, nil, apply); duplicate || !errors.Is(err, ErrOfferConflict) {
		t.Fatalf("old revision candidate = (%v, %v), want ErrOfferConflict", duplicate, err)
	}
}
