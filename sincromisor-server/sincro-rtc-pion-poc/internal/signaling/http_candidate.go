package signaling

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

// candidateRequest はcandidate fieldのmissingとexplicit nullをHTTP境界まで保持する。
type candidateRequest struct {
	SessionID     string          `json:"session_id"`
	OfferRevision uint64          `json:"offer_revision"`
	Candidate     json.RawMessage `json:"candidate"`
}

type candidateResponse struct {
	Status bool `json:"status"`
}

// handleCandidate はrevision identity、presence、byte limitを検証してSession transactionへ渡す。
//
// explicit nullはend-of-candidatesとして保持し、field missingは400にする。managerのtyped failureは
// unknown/closed/conflict/capacityへ分離し、duplicate candidateは成功responseを返す。
func (s *Server) handleCandidate(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	var payload candidateRequest
	if err := decodeJSON(writer, request, &payload); err != nil {
		if errors.Is(err, errRequestBodyTooLarge) {
			writeError(writer, http.StatusRequestEntityTooLarge, "Candidate body is too large.")
			return
		}
		writeError(writer, http.StatusBadRequest, "Malformed candidate JSON.")
		return
	}
	if payload.SessionID == "" || payload.OfferRevision == 0 {
		writeError(writer, http.StatusBadRequest, "session_id and offer_revision are required.")
		return
	}
	if _, err := ulid.ParseStrict(payload.SessionID); err != nil || payload.Candidate == nil {
		writeError(writer, http.StatusBadRequest, "Invalid candidate identity or missing candidate.")
		return
	}
	candidate, status, message := decodeCandidate(payload.Candidate)
	if message != "" {
		writeError(writer, status, message)
		return
	}
	var err error
	s.withSessionMutation(payload.SessionID, func() {
		_, err = s.sessions.AddCandidate(payload.SessionID, payload.OfferRevision, candidate)
	})
	switch {
	case err == nil:
		writeJSON(writer, http.StatusOK, candidateResponse{Status: true})
	case errors.Is(err, rtc.ErrSessionUnknown):
		writeError(writer, http.StatusNotFound, "Session not found.")
	case errors.Is(err, rtc.ErrSessionClosed):
		writeError(writer, http.StatusGone, "Session is closed.")
	case errors.Is(err, rtc.ErrOfferConflict):
		writeError(writer, http.StatusConflict, "Candidate revision conflicts with session state.")
	case errors.Is(err, rtc.ErrCandidateLimit):
		writeError(writer, http.StatusTooManyRequests, "Too many candidates.")
	default:
		s.logger.Warn("candidate rejected", "session_id", payload.SessionID, "reason", "invalid_candidate")
		writeError(writer, http.StatusBadRequest, "Invalid ICE candidate.")
	}
}

// decodeCandidate はraw JSON presenceをdomain candidateへ変換し、文字列bytesを変形せず上限判定する。
func decodeCandidate(raw json.RawMessage) (*rtc.Candidate, int, string) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, http.StatusOK, ""
	}
	var candidate rtc.Candidate
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&candidate); err != nil || candidate.Candidate == "" {
		return nil, http.StatusBadRequest, "Invalid ICE candidate."
	}
	if len(candidate.Candidate) > maxCandidateBytes {
		return nil, http.StatusRequestEntityTooLarge, "ICE candidate is too large."
	}
	return &candidate, http.StatusOK, ""
}
