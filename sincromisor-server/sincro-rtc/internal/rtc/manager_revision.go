package rtc

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/pion/webrtc/v4"
)

// AddCandidate はactive Sessionのcurrent revisionへTrickle ICE candidateを一度適用する。
//
// unknown/closed/revision conflict/capacityはtyped errorで返し、HTTP境界が404/410/409/429へ
// 変換する。duplicateは成功扱いだがPionへ再適用せず、新規Sessionへfallbackしない。
func (m *Manager) AddCandidate(sessionID string, revision uint64, candidate *Candidate) (duplicate bool, err error) {
	session, err := m.activeSession(sessionID)
	if err != nil {
		return false, err
	}
	init := webrtc.ICECandidateInit{}
	if candidate != nil {
		if candidate.Candidate == "" {
			return false, errors.New("candidate string is required")
		}
		init = webrtc.ICECandidateInit{
			Candidate:        candidate.Candidate,
			SDPMid:           candidate.SDPMid,
			SDPMLineIndex:    candidate.SDPMLineIndex,
			UsernameFragment: candidate.UsernameFragment,
		}
	}
	return session.addRevisionCandidate(revision, candidate, init)
}

// Update はactive Sessionの同じPeerConnectionへICE restart Offerを適用する。
//
// session ID、initial request ID、保存済みtalk mode、strict revisionを検証し、同revision再送には
// cache済みAnswerを返す。remote description適用後の失敗はrollback不能なためSessionをcloseする。
func (m *Manager) Update(ctx context.Context, offer UpdateOffer) (Answer, error) {
	session, err := m.activeSession(offer.SessionID)
	if err != nil {
		return Answer{}, err
	}
	if offer.Type != "offer" || strings.TrimSpace(offer.SDP) == "" {
		return Answer{}, errors.New("update offer fields are invalid")
	}
	if offer.TalkMode != session.talkMode {
		return Answer{}, ErrOfferConflict
	}
	requestID, err := uuid.Parse(offer.OfferRequestID)
	if err != nil {
		return Answer{}, errors.New("offer request id must be a UUID")
	}
	return session.update(ctx, requestID, offer.Revision, offer.SDP)
}

// activeSession はregistry snapshotを返し、発行履歴からunknownとclosing/closedを区別する。
func (m *Manager) activeSession(sessionID string) (*Session, error) {
	m.mu.RLock()
	session := m.sessions[sessionID]
	_, wasClosed := m.closed[sessionID]
	m.mu.RUnlock()
	if session != nil {
		session.lifecycle.mu.Lock()
		terminal := session.lifecycle.terminalLocked()
		session.lifecycle.mu.Unlock()
		if terminal {
			return nil, ErrSessionClosed
		}
		return session, nil
	}
	if wasClosed {
		return nil, ErrSessionClosed
	}
	return nil, ErrSessionUnknown
}
