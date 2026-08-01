// Package signaling は既存 Frontend RTC HTTP 契約と Pion session manager を接続する。
package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

const (
	apiPrefix       = "/api/v1/RTCSignalingServer/"
	configPath      = apiPrefix + "config.json"
	offerPath       = apiPrefix + "offer"
	candidatePath   = apiPrefix + "candidate"
	maxRequestBytes = 1 << 20
	maxSDPBytes     = 256 << 10
)

var errRequestBodyTooLarge = errors.New("request body too large")

// SessionService は HTTP boundary が必要とする session 操作だけを表す。
//
// production では rtc.Manager が実装し、test では WebRTC transport を起動せず status / timeout 変換を
// 検証する。schema や retry policy を隠す汎用 abstraction にはしない。
type SessionService interface {
	Create(context.Context, rtc.Offer) (rtc.Answer, error)
	AddCandidate(string, *rtc.Candidate) (bool, string, error)
	Count() int
}

// Server は 3 signaling endpoint と build 済み Frontend の same-origin static 配信を提供する。
//
// API prefix は static file より先に routing し、未知 API を Frontend asset として返さない。
// Request body は有限長に制限し、JSON / SDP / candidate error を request 単位の 4xx に変換する。
type Server struct {
	sessions    SessionService
	offers      *OfferRegistry
	frontendDir string
	iceServers  []iceServerResponse
	logger      *slog.Logger
}

// New は signaling handler、initial Offer registry、session dependencyを固定する。
//
// frontendDir の存在確認は config.Load の起動時境界で完了済みである。New は listener を開かず、
// caller が Handler を http.Server へ渡すまで外部副作用を持たない。candidate gatheringのownerと
// timeoutはOfferRegistryがprocess lifecycle内で所有する。
func New(
	sessions SessionService,
	offers *OfferRegistry,
	frontendDir string,
	stunURL string,
	logger *slog.Logger,
) *Server {
	iceServers := make([]iceServerResponse, 0)
	if stunURL != "" {
		iceServers = []iceServerResponse{{URLs: stunURL}}
	}
	return &Server{
		sessions:    sessions,
		offers:      offers,
		frontendDir: frontendDir,
		iceServers:  iceServers,
		logger:      logger,
	}
}

// Handler は API precedence を保った http.Handler を構築する。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(configPath, s.handleConfig)
	mux.HandleFunc(offerPath, s.handleOffer)
	mux.HandleFunc(candidatePath, s.handleCandidate)
	mux.HandleFunc(apiPrefix, func(writer http.ResponseWriter, _ *http.Request) {
		writeError(writer, http.StatusNotFound, "API endpoint not found.")
	})
	mux.Handle("/", http.FileServer(http.Dir(s.frontendDir)))
	return mux
}

type iceServerResponse struct {
	URLs string `json:"urls"`
}

type configResponse struct {
	OfferURL     string              `json:"offerURL"`
	CandidateURL string              `json:"candidateURL"`
	ICEServers   []iceServerResponse `json:"iceServers"`
}

type offerRequest struct {
	SDP               string `json:"sdp"`
	Type              string `json:"type"`
	TalkMode          string `json:"talk_mode"`
	SessionID         string `json:"session_id,omitempty"`
	OfferRequestID    string `json:"offer_request_id"`
	OfferRevision     int    `json:"offer_revision"`
	PreviousSessionID string `json:"previous_session_id,omitempty"`
}

type candidateRequest struct {
	SessionID string         `json:"session_id"`
	Candidate *rtc.Candidate `json:"candidate"`
}

type candidateResponse struct {
	Status bool   `json:"status"`
	Reason string `json:"reason,omitempty"`
}

func (s *Server) handleConfig(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	writeJSON(writer, http.StatusOK, configResponse{
		OfferURL:     offerPath,
		CandidateURL: candidatePath,
		ICEServers:   s.iceServers,
	})
}

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
	if payload.SessionID != "" {
		writeError(writer, http.StatusNotImplemented, "Session update offers are not implemented by this PoC.")
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
	if !validUUID(payload.OfferRequestID) || payload.OfferRevision != 1 {
		writeError(writer, http.StatusBadRequest, "Invalid initial offer identity.")
		return
	}
	if payload.PreviousSessionID != "" {
		if _, err := ulid.ParseStrict(payload.PreviousSessionID); err != nil {
			writeError(writer, http.StatusBadRequest, "Invalid previous_session_id.")
			return
		}
	}
	// Session admissionより先にregistryへ登録し、decoded SDP bytesをUUIDへSHA-256で結び付ける。
	answer, err := s.offers.Resolve(request.Context(), payload.OfferRequestID, []byte(payload.SDP), rtc.Offer{
		SDP: payload.SDP, Type: payload.Type, TalkMode: payload.TalkMode,
	})
	if err != nil {
		// ownerのtyped failureをretry可否が異なるHTTP statusへ一度だけ変換し、失敗結果はcacheしない。
		switch {
		case errors.Is(err, context.DeadlineExceeded):
			writeError(writer, http.StatusGatewayTimeout, "ICE candidate gathering timed out.")
			return
		case errors.Is(err, ErrOfferConflict):
			writeError(writer, http.StatusConflict, "Offer request ID conflicts with another SDP.")
			return
		case errors.Is(err, ErrOfferGone):
			writeError(writer, http.StatusGone, "Offer session is closed.")
			return
		case errors.Is(err, ErrOfferCapacity), errors.Is(err, rtc.ErrSessionCapacity):
			writeError(writer, http.StatusTooManyRequests, "Too many requests.")
			return
		}
		s.logger.Warn("offer rejected", "error_type", fmt.Sprintf("%T", err))
		writeError(writer, http.StatusBadRequest, "Invalid offer SDP.")
		return
	}
	s.logger.Info("offer answered",
		"session_id", answer.SessionID,
		"active_sessions", s.sessions.Count(),
	)
	if payload.PreviousSessionID != "" {
		s.logger.Info("initial offer replaced session",
			"previous_session_id", payload.PreviousSessionID,
			"session_id", answer.SessionID,
		)
	}
	writeJSON(writer, http.StatusOK, answer)
}

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
	if payload.SessionID == "" {
		writeError(writer, http.StatusBadRequest, "session_id is required.")
		return
	}
	applied, reason, err := s.sessions.AddCandidate(payload.SessionID, payload.Candidate)
	if err != nil {
		s.logger.Warn("candidate rejected", "session_id", payload.SessionID, "error", err)
		writeError(writer, http.StatusBadRequest, "Invalid ICE candidate.")
		return
	}
	// late candidate は transport error ではなく契約上の安全な拒否として 200 を返す。
	writeJSON(writer, http.StatusOK, candidateResponse{Status: applied, Reason: reason})
}

// decodeJSON は1 MiBを超えるbody、未知field、複数JSON valueをdomain処理より先に拒否する。
// MaxBytesErrorはcallerが413へ分離できるsentinelを保ち、その他のsyntax/type errorは400へ委ねる。
func decodeJSON(writer http.ResponseWriter, request *http.Request, target any) error {
	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return fmt.Errorf("%w: %v", errRequestBodyTooLarge, err)
		}
		return fmt.Errorf("decode json: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); isMaxBytesError(err) {
		return fmt.Errorf("%w: %v", errRequestBodyTooLarge, err)
	} else if !errors.Is(err, io.EOF) {
		return errors.New("json body must contain one value")
	}
	return nil
}

func isMaxBytesError(err error) bool {
	var maxBytesErr *http.MaxBytesError
	return errors.As(err, &maxBytesErr)
}

func validUUID(value string) bool {
	parsed, err := uuid.Parse(value)
	return err == nil && strings.EqualFold(parsed.String(), value)
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		slog.Error("write json response failed", "error", err)
	}
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}
