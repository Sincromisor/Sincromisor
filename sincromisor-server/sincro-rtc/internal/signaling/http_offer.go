package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/signaling/offer"
)

// handleOffer はsession_id presenceでinitial registryとupdate transactionを排他的にroutingする。
//
// initialだけがPreviousSessionIDとrevision 1を許可し、updateはstrict ULIDを検証して専用handlerへ渡す。
// update失敗をinitial Session作成へfallbackせず、両経路のsize/schema validationをresource作成前に行う。
// draining中もupdateは既存session操作へroutingするが、新規initial Offerはregistry ownerを作る前に503で拒否する。
func (s *Server) handleOffer(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	var payload offerRequest
	if err := decodeJSON(writer, request, &payload); err != nil {
		if errors.Is(err, errRequestBodyTooLarge) {
			writeError(writer, http.StatusRequestEntityTooLarge, "Offer body is too large.")
			return
		}
		writeError(writer, http.StatusBadRequest, "Malformed offer JSON.")
		return
	}
	if payload.SessionID != nil {
		var sessionID string
		if json.Unmarshal(payload.SessionID, &sessionID) != nil || sessionID == "" {
			writeError(writer, http.StatusBadRequest, "Invalid session_id.")
			return
		}
		if _, err := ulid.ParseStrict(sessionID); err != nil {
			writeError(writer, http.StatusBadRequest, "Invalid session_id.")
			return
		}
		s.withSessionMutation(sessionID, func() {
			s.handleUpdateOffer(writer, request, payload, sessionID)
		})
		return
	}
	if s.state.Draining() {
		writeError(writer, http.StatusServiceUnavailable, "Server is draining.")
		return
	}
	if len(payload.SDP) > maxSDPBytes {
		writeError(writer, http.StatusRequestEntityTooLarge, "Offer SDP is too large.")
		return
	}
	if payload.SDP == "" || payload.Type != "offer" ||
		(payload.TalkMode != "chat" && payload.TalkMode != "sincro") {
		writeError(writer, http.StatusBadRequest, "Invalid offer fields.")
		return
	}
	// 配信済みfrontendのlegacy initial Offerだけはidentityを完全に省略する。
	// request IDがないためretryを同一registry entryへ結び付けられず、部分欠損や明示的な
	// 空/0は通常形式の不正identityとして拒否する。
	if payload.OfferRequestID == nil && payload.OfferRevision == nil {
		requestID := uuid.NewString()
		revision := uint64(1)
		payload.OfferRequestID = &requestID
		payload.OfferRevision = &revision
	}
	if payload.OfferRequestID == nil || payload.OfferRevision == nil ||
		!validUUID(*payload.OfferRequestID) || *payload.OfferRevision != 1 {
		writeError(writer, http.StatusBadRequest, "Invalid initial offer identity.")
		return
	}
	previousSessionID := ""
	if payload.PreviousSessionID != nil {
		if err := json.Unmarshal(payload.PreviousSessionID, &previousSessionID); err != nil ||
			previousSessionID == "" {
			writeError(writer, http.StatusBadRequest, "Invalid previous_session_id.")
			return
		}
		if _, err := ulid.ParseStrict(previousSessionID); err != nil {
			writeError(writer, http.StatusBadRequest, "Invalid previous_session_id.")
			return
		}
	}
	// Session admissionより先にregistryへ登録し、decoded SDP bytesをUUIDへSHA-256で結び付ける。
	answer, err := s.offers.Resolve(request.Context(), *payload.OfferRequestID, []byte(payload.SDP), rtc.Offer{
		SDP: payload.SDP, Type: payload.Type, TalkMode: payload.TalkMode,
		OfferRequestID: *payload.OfferRequestID,
	})
	if err != nil {
		// ownerのtyped failureをretry可否が異なるHTTP statusへ一度だけ変換し、失敗結果はcacheしない。
		switch {
		case errors.Is(err, context.DeadlineExceeded):
			writeError(writer, http.StatusGatewayTimeout, "ICE candidate gathering timed out.")
			return
		case errors.Is(err, offer.ErrOfferConflict):
			writeError(writer, http.StatusConflict, "Offer request ID conflicts with another SDP.")
			return
		case errors.Is(err, offer.ErrOfferGone):
			writeError(writer, http.StatusGone, "Offer session is closed.")
			return
		case errors.Is(err, offer.ErrOfferCapacity), errors.Is(err, rtc.ErrSessionCapacity):
			writeError(writer, http.StatusTooManyRequests, "Too many requests.")
			return
		case errors.Is(err, rtc.ErrSessionPanic):
			writeError(writer, http.StatusInternalServerError, "Internal server error.")
			return
		}
		s.logger.Warn("offer rejected", "reason", "offer_error")
		writeError(writer, http.StatusBadRequest, "Invalid offer SDP.")
		return
	}
	s.logger.Info("offer answered",
		"session_id", answer.SessionID,
		"count", s.sessions.Count(),
	)
	if previousSessionID != "" {
		s.logger.Info("initial offer replaced session",
			"session_id", answer.SessionID,
			"stage", "session_replacement",
		)
	}
	writeJSON(writer, http.StatusOK, answer)
}
