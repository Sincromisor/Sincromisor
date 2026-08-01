package rtc

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"sync"

	"github.com/google/uuid"
	"github.com/pion/webrtc/v4"
)

// maxCandidatesPerRevision はbrowser queue暴走時も1 ICE generationのdedupe memoryを有限に保つ上限である。
//
// 65件目の異なるcandidateはErrCandidateLimitとなり、duplicateは件数へ加算しない。
const maxCandidatesPerRevision = 64

var (
	// ErrSessionUnknown は process lifetime 中に発行されていない session ID を表す。
	ErrSessionUnknown = errors.New("rtc session is unknown")
	// ErrSessionClosed は発行済み session が closing または closed であることを表す。
	ErrSessionClosed = errors.New("rtc session is closed")
	// ErrOfferConflict は request identity、revision、SDP、talk mode の競合を表す。
	ErrOfferConflict = errors.New("rtc update offer conflicts with session state")
	// ErrCandidateLimit は current revision の異なる candidate が上限へ到達したことを表す。
	ErrCandidateLimit = errors.New("rtc candidate limit reached")
)

// revisionState は1 Sessionのaccepted Offerとcandidate冪等境界を所有する。
//
// currentは1から単調増加し、requestIDはinitial OfferのUUIDから変わらない。answerとsdpHashは
// 完成したrevisionだけを表し、candidateHashesはrevision commit時に空へ交換する。
// updateInFlightは重いPion処理を待たず並行Offerを拒否するためstate mutex配下で公開する。
type revisionState struct {
	mu              sync.Mutex
	operationMu     sync.Mutex
	current         uint64
	requestID       uuid.UUID
	sdpHash         [sha256.Size]byte
	answer          Answer
	candidateHashes map[[sha256.Size]byte]struct{}
	updateInFlight  bool
}

// newRevisionState は完成したinitial Answerをrevision 1のretry/dedupe基点にする。
func newRevisionState(requestID uuid.UUID, sdp string, answer Answer) *revisionState {
	return &revisionState{
		current:         1,
		requestID:       requestID,
		sdpHash:         sha256.Sum256([]byte(sdp)),
		answer:          answer,
		candidateHashes: make(map[[sha256.Size]byte]struct{}),
	}
}

// commitUpdate は完成Answer、revision進行、restart deadline停止をCloseとatomicに確定する。
//
// lifecycle lockを先に取る順序はCloseと同じであり、terminal確定後のupdateをcacheしない。
// commitが先ならAnswerは有効な瞬間を持ち、その後の独立したCloseは通常のsession終了として扱う。
func (s *Session) commitUpdate(revision uint64, offerSDP string, answer Answer) bool {
	s.lifecycle.mu.Lock()
	defer s.lifecycle.mu.Unlock()
	if s.lifecycle.terminalLocked() {
		return false
	}
	s.lifecycle.recovery = recoveryNone
	s.lifecycle.recoveryDeadlines.stop()
	s.revision.finishUpdate(revision, offerSDP, answer, true)
	return true
}

// update はrevision transactionのsingle-flight権をPion Offer/Answer処理へ接続する。
//
// operationMuはcandidate適用とremote/local description変更を直列化する。SetRemoteDescription成功後は
// Pion rollbackへ依存せず、以降の失敗をclose-onceへ通知する。完成Answerだけをcommitし、
// successful updateはdisconnected grace/restart deadlineをcancelする。
func (s *Session) update(
	ctx context.Context,
	requestID uuid.UUID,
	revision uint64,
	offerSDP string,
) (Answer, error) {
	if err := s.ctx.Err(); err != nil {
		return Answer{}, ErrSessionClosed
	}
	cached, proceed, err := s.revision.beginUpdate(requestID, revision, offerSDP)
	if err != nil || !proceed {
		return cached, err
	}
	committed := false
	defer func() {
		if !committed {
			s.revision.finishUpdate(revision, offerSDP, Answer{}, false)
		}
	}()

	s.revision.operationMu.Lock()
	defer s.revision.operationMu.Unlock()
	description, remoteApplied, err := s.negotiateDescription(ctx, offerSDP)
	if err != nil {
		if remoteApplied {
			_ = s.Close("update_offer_partial_apply")
		}
		return Answer{}, err
	}
	answer := Answer{
		SDP: description.SDP, Type: description.Type.String(),
		SessionID: s.id, Revision: revision,
	}
	if !s.commitUpdate(revision, offerSDP, answer) {
		return Answer{}, ErrSessionClosed
	}
	committed = true
	return answer, nil
}

// addRevisionCandidate はrevision/dedupe/上限判定とPion AddICECandidateを同じsession操作へ直列化する。
func (s *Session) addRevisionCandidate(
	revision uint64,
	candidate *Candidate,
	init webrtc.ICECandidateInit,
) (bool, error) {
	if err := s.ctx.Err(); err != nil {
		return false, ErrSessionClosed
	}
	return s.revision.addCandidate(revision, candidate, func() error {
		return s.addCandidate(init)
	})
}

// beginUpdate はrevision identityを検証し、再送Answerまたはsingle-flight更新権を返す。
//
// current revisionの同一SDPは完成済みAnswerだけを返す。次revisionだけが更新権を得て、
// old/future、異なるSDP、request ID再利用、並行updateはすべて同じ競合として拒否される。
func (r *revisionState) beginUpdate(requestID uuid.UUID, revision uint64, sdp string) (Answer, bool, error) {
	hash := sha256.Sum256([]byte(sdp))
	r.mu.Lock()
	defer r.mu.Unlock()
	if requestID != r.requestID || r.updateInFlight {
		return Answer{}, false, ErrOfferConflict
	}
	if revision == r.current {
		if hash != r.sdpHash {
			return Answer{}, false, ErrOfferConflict
		}
		return r.answer, false, nil
	}
	if revision != r.current+1 {
		return Answer{}, false, ErrOfferConflict
	}
	r.updateInFlight = true
	return Answer{}, true, nil
}

// finishUpdate はupdate権を解放し、成功時だけaccepted revision一式を交換する。
func (r *revisionState) finishUpdate(revision uint64, sdp string, answer Answer, committed bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if committed {
		r.current = revision
		r.sdpHash = sha256.Sum256([]byte(sdp))
		r.answer = answer
		r.candidateHashes = make(map[[sha256.Size]byte]struct{})
	}
	r.updateInFlight = false
}

// addCandidate はcurrent revisionのcandidateだけをPionへ一度適用する。
//
// canonical hashはraw candidate bytesとoptional fieldの値を長さ付きで連結する。optional fieldの
// missing/nullはどちらもnil pointerとなるため同一視し、文字列のtrimやcase変換はしない。
// Pion適用に失敗した値はdedupe集合へ記録せず、修正後のrequestを上限から独立して再試行できる。
func (r *revisionState) addCandidate(
	revision uint64,
	candidate *Candidate,
	apply func() error,
) (duplicate bool, err error) {
	r.operationMu.Lock()
	defer r.operationMu.Unlock()

	hash := candidateHash(candidate)
	r.mu.Lock()
	if revision != r.current {
		r.mu.Unlock()
		return false, ErrOfferConflict
	}
	if _, exists := r.candidateHashes[hash]; exists {
		r.mu.Unlock()
		return true, nil
	}
	if len(r.candidateHashes) >= maxCandidatesPerRevision {
		r.mu.Unlock()
		return false, ErrCandidateLimit
	}
	r.mu.Unlock()
	if err := apply(); err != nil {
		return false, err
	}
	r.mu.Lock()
	r.candidateHashes[hash] = struct{}{}
	r.mu.Unlock()
	return false, nil
}

// candidateHash はwire tupleを曖昧な区切りのないSHA-256入力へ変換する。
func candidateHash(candidate *Candidate) [sha256.Size]byte {
	hash := sha256.New()
	if candidate == nil {
		hash.Write([]byte{0})
	} else {
		hash.Write([]byte{1})
		writeCandidateField(hash, []byte(candidate.Candidate))
		writeOptionalCandidateField(hash, candidate.SDPMid)
		if candidate.SDPMLineIndex == nil {
			writeCandidateField(hash, nil)
		} else {
			var encoded [2]byte
			binary.BigEndian.PutUint16(encoded[:], *candidate.SDPMLineIndex)
			writeCandidateField(hash, encoded[:])
		}
		writeOptionalCandidateField(hash, candidate.UsernameFragment)
	}
	var result [sha256.Size]byte
	copy(result[:], hash.Sum(nil))
	return result
}

type candidateHashWriter interface {
	Write([]byte) (int, error)
}

func writeOptionalCandidateField(hash candidateHashWriter, value *string) {
	if value == nil {
		hash.Write([]byte{0})
		return
	}
	hash.Write([]byte{1})
	writeCandidateField(hash, []byte(*value))
}

func writeCandidateField(hash candidateHashWriter, value []byte) {
	var length [8]byte
	binary.BigEndian.PutUint64(length[:], uint64(len(value))+1)
	hash.Write(length[:])
	hash.Write(value)
}
