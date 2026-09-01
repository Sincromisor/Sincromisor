package rtc

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

// Create は initial Offer から session を作り、half-trickle Answer を返す。
//
// type、SDP、talk_mode、initial request UUIDをresource作成前に検証する。session専用Coordinatorを
// 作った後、request deadlineをPionのSTUN gather上限へ伝播してcandidate収集済みAnswerを作る。
// 成功Answerをrevision 1のretry基点として保存し、失敗時は同じ非同期close経路へ通知する。
func (m *Manager) Create(ctx context.Context, offer Offer) (result Answer, returnErr error) {
	if offer.Type != "offer" {
		return Answer{}, errors.New("offer type must be offer")
	}
	if strings.TrimSpace(offer.SDP) == "" {
		return Answer{}, errors.New("offer sdp is required")
	}
	if offer.TalkMode != "chat" && offer.TalkMode != "sincro" {
		return Answer{}, errors.New("talk mode must be chat or sincro")
	}
	requestID, err := uuid.Parse(offer.OfferRequestID)
	if err != nil {
		return Answer{}, errors.New("offer request id must be a UUID")
	}
	// Coordinator、PeerConnection、codec作成前にadmissionを予約する。Session公開またはsetup失敗まで
	// registry lock配下のactive+reservation合計へ含め、並行作成でもMaxSessionsを超えない。
	if err := m.reserve(); err != nil {
		return Answer{}, err
	}
	reserved := true
	var coordinator *pipeline.Coordinator
	var session *Session
	defer func() {
		if recover() != nil {
			switch {
			case session != nil:
				_ = session.Close("panic")
			case coordinator != nil:
				_ = coordinator.Close()
			}
			result = Answer{}
			returnErr = ErrSessionPanic
		}
		if reserved {
			m.releaseReservation()
		}
	}()
	coordinator, err = pipeline.NewCoordinator(m.config.PipelineFactory, m.config.Logger)
	if err != nil {
		return Answer{}, err
	}
	sessionID := ulid.Make().String()
	gatherTimeout := time.Duration(0)
	if deadline, ok := ctx.Deadline(); ok {
		gatherTimeout = time.Until(deadline)
		if gatherTimeout <= 0 {
			_ = coordinator.Close()
			return Answer{}, ctx.Err()
		}
	}
	session, err = m.buildSession(sessionBuildRequest{
		id:            sessionID,
		talkMode:      offer.TalkMode,
		gatherTimeout: gatherTimeout,
		coordinator:   coordinator,
		synthDecoder:  m.config.SynthDecoder,
		onClosed: func(closedID string) {
			m.remove(closedID)
			if offer.OnClosed != nil {
				offer.OnClosed(closedID)
			}
		},
		recorder: m.config.Recorder,
	})
	if err != nil {
		_ = coordinator.Close()
		return Answer{}, err
	}
	m.mu.Lock()
	m.reservations--
	reserved = false
	m.sessions[sessionID] = session
	m.mu.Unlock()
	m.config.Recorder.SessionCreated()

	answer, err := session.negotiate(ctx, offer.SDP)
	if err != nil {
		_ = session.Close("offer_failed")
		return Answer{}, err
	}
	result = Answer{SDP: answer.SDP, Type: answer.Type.String(), SessionID: sessionID, Revision: 1}
	session.revision = newRevisionState(requestID, offer.SDP, result)
	return result, nil
}

// ErrSessionPanic は初回Session構築または交渉中のpanicを回収したことを表す。
// このエラーがシグナリングへ届く時点で、Managerは受付予約を解放し、部分的に所有した資源を閉じている。
var ErrSessionPanic = errors.New("rtc session creation panic")
