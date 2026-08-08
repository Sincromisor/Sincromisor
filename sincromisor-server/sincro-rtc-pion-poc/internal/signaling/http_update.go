package signaling

import (
	"context"
	"errors"
	"net/http"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

// handleUpdateOffer はinitial registryへfallbackせず既存Sessionのrevision transactionだけを呼ぶ。
//
// schema/type/sizeはresource操作前に400/413へ分離し、managerのsession identity、closed、
// revision/talk mode/single-flight競合を404/410/409へ写像する。失敗AnswerはHTTP層で保持しない。
func (s *Server) handleUpdateOffer(
	writer http.ResponseWriter,
	request *http.Request,
	payload offerRequest,
	sessionID string,
) {
	if len(payload.SDP) > maxSDPBytes {
		writeError(writer, http.StatusRequestEntityTooLarge, "Offer SDP is too large.")
		return
	}
	if payload.SDP == "" || payload.Type != "offer" ||
		(payload.TalkMode != "chat" && payload.TalkMode != "sincro") ||
		payload.OfferRequestID == nil || payload.OfferRevision == nil ||
		!validUUID(*payload.OfferRequestID) || *payload.OfferRevision == 0 {
		writeError(writer, http.StatusBadRequest, "Invalid update offer fields.")
		return
	}
	if payload.PreviousSessionID != nil {
		writeError(writer, http.StatusBadRequest, "previous_session_id is not valid for an update offer.")
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), s.offers.config.GatherTimeout)
	defer cancel()
	var answer rtc.Answer
	var err error
	answer, err = s.sessions.Update(ctx, rtc.UpdateOffer{
		SDP: payload.SDP, Type: payload.Type, TalkMode: payload.TalkMode,
		SessionID: sessionID, OfferRequestID: *payload.OfferRequestID, Revision: *payload.OfferRevision,
	})
	switch {
	case err == nil:
		writeJSON(writer, http.StatusOK, answer)
	case errors.Is(err, rtc.ErrSessionUnknown):
		writeError(writer, http.StatusNotFound, "Session not found.")
	case errors.Is(err, rtc.ErrSessionClosed):
		writeError(writer, http.StatusGone, "Session is closed.")
	case errors.Is(err, rtc.ErrOfferConflict):
		writeError(writer, http.StatusConflict, "Update offer conflicts with session state.")
	case errors.Is(err, context.DeadlineExceeded):
		writeError(writer, http.StatusGatewayTimeout, "ICE candidate gathering timed out.")
	default:
		s.logger.Warn("update offer rejected", "session_id", sessionID, "reason", "offer_error")
		writeError(writer, http.StatusBadRequest, "Invalid update offer SDP.")
	}
	s.afterMutation()
}
