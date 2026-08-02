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
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

const (
	apiPrefix       = "/api/v1/RTCSignalingServer/"
	configPath      = apiPrefix + "config.json"
	offerPath       = apiPrefix + "offer"
	candidatePath   = apiPrefix + "candidate"
	statusesPath    = apiPrefix + "statuses"
	livenessPath    = "/health/live"
	readinessPath   = "/health/ready"
	metricsPath     = "/metrics"
	maxRequestBytes = 1 << 20
	maxSDPBytes     = 256 << 10
	// maxCandidateBytesは通常browser candidateに余裕を持たせつつ単一fieldのmemory abuseを拒否する。
	maxCandidateBytes = 8 << 10
)

var errRequestBodyTooLarge = errors.New("request body too large")

// SessionService はHTTP boundaryが必要とするinitial/update/candidate/session count操作を表す。
//
// productionではrtc.Managerが実装し、typed unknown/closed/conflict/capacity errorを返す。testでは
// WebRTC transportを起動せずHTTP status/timeout変換を検証し、schemaやretry policyはHTTP側に残す。
type SessionService interface {
	Create(context.Context, rtc.Offer) (rtc.Answer, error)
	Update(context.Context, rtc.UpdateOffer) (rtc.Answer, error)
	AddCandidate(string, uint64, *rtc.Candidate) (bool, error)
	Count() int
}

// Server は 3 signaling endpoint と build 済み Frontend の same-origin static 配信を提供する。
//
// API prefix は static file より先に routing し、未知 API を Frontend asset として返さない。
// Request body は有限長に制限し、JSON / SDP / candidate error を request 単位の 4xx に変換する。
type Server struct {
	sessions     SessionService
	offers       *OfferRegistry
	frontendDir  string
	iceServers   []iceServerResponse
	logger       *slog.Logger
	state        *ProcessState
	recorder     observability.Recorder
	metrics      http.Handler
	mutationHook func()
}

func (s *Server) afterMutation() {
	if s.mutationHook != nil {
		s.mutationHook()
	}
}

// ProcessState is the process admission state shared by health handlers and
// graceful shutdown. Startup marks ready only after every local dependency has
// been validated; draining is monotonic for the lifetime of a process.
type ProcessState struct {
	ready    atomic.Bool
	draining atomic.Bool
}

// NewProcessState returns a non-ready, non-draining startup state.
func NewProcessState() *ProcessState { return &ProcessState{} }

// MarkReady publishes successful startup validation.
func (s *ProcessState) MarkReady() { s.ready.Store(true) }

// BeginDrain publishes ready=false and the monotonic draining state before any
// process owner is cancelled. The process coordinator keeps HTTP accepting for
// its admission window, during which new initial offers observe a 503 response
// instead of an ambiguous connection refusal.
func (s *ProcessState) BeginDrain() { s.draining.Store(true); s.ready.Store(false) }

// Ready reports whether the process can safely admit a new session.
func (s *ProcessState) Ready() bool { return s.ready.Load() && !s.draining.Load() }

// Draining reports whether shutdown admission control has begun.
func (s *ProcessState) Draining() bool { return s.draining.Load() }

// Options adds process health and telemetry without changing the established
// signaling constructor call shape used by transport-focused tests.
type Options struct {
	State    *ProcessState
	Recorder observability.Recorder
	Metrics  http.Handler
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
	options ...Options,
) *Server {
	iceServers := make([]iceServerResponse, 0)
	if stunURL != "" {
		iceServers = []iceServerResponse{{URLs: stunURL}}
	}
	state := NewProcessState()
	state.MarkReady()
	var recorder observability.Recorder
	var metrics http.Handler
	if len(options) > 0 {
		if options[0].State != nil {
			state = options[0].State
		}
		recorder = options[0].Recorder
		metrics = options[0].Metrics
	}
	return &Server{
		sessions:    sessions,
		offers:      offers,
		frontendDir: frontendDir,
		iceServers:  iceServers,
		logger:      logger,
		state:       state,
		recorder:    recorder,
		metrics:     metrics,
	}
}

// Handler は API precedence を保った http.Handler を構築する。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(configPath, s.handleConfig)
	mux.HandleFunc(offerPath, s.handleOffer)
	mux.HandleFunc(candidatePath, s.handleCandidate)
	mux.HandleFunc(statusesPath, s.handleStatuses)
	mux.HandleFunc(livenessPath, s.handleLive)
	mux.HandleFunc(readinessPath, s.handleReady)
	if s.metrics != nil {
		mux.Handle(metricsPath, s.metrics)
	}
	mux.HandleFunc(apiPrefix, func(writer http.ResponseWriter, _ *http.Request) {
		writeError(writer, http.StatusNotFound, "API endpoint not found.")
	})
	mux.Handle("/", http.FileServer(http.Dir(s.frontendDir)))
	// Observation is the outer commit owner: recoverHTTP always returns after
	// committing either the buffered success response or a fresh panic 500, so
	// every signaling request contributes exactly one final status and latency.
	return s.observeHTTP(s.recoverHTTP(mux))
}

type iceServerResponse struct {
	URLs string `json:"urls"`
}

type configResponse struct {
	OfferURL     string              `json:"offerURL"`
	CandidateURL string              `json:"candidateURL"`
	ICEServers   []iceServerResponse `json:"iceServers"`
}

// offerRequest はinitial/updateの識別fieldについてJSON presenceとtypeをdecode後まで保持する。
// RawMessageにより、omitemptyのGo zero valueへ潰れるnull/空文字とfield省略を境界で区別する。
type offerRequest struct {
	SDP               string          `json:"sdp"`
	Type              string          `json:"type"`
	TalkMode          string          `json:"talk_mode"`
	SessionID         json.RawMessage `json:"session_id,omitempty"`
	OfferRequestID    string          `json:"offer_request_id"`
	OfferRevision     uint64          `json:"offer_revision"`
	PreviousSessionID json.RawMessage `json:"previous_session_id,omitempty"`
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
	if !validUUID(payload.OfferRequestID) || payload.OfferRevision != 1 {
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
	answer, err := s.offers.Resolve(request.Context(), payload.OfferRequestID, []byte(payload.SDP), rtc.Offer{
		SDP: payload.SDP, Type: payload.Type, TalkMode: payload.TalkMode,
		OfferRequestID: payload.OfferRequestID,
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

type statusResponse struct {
	Sessions     int  `json:"sessions"`
	SessionLimit int  `json:"session_limit"`
	Ready        bool `json:"ready"`
	Draining     bool `json:"draining"`
}

// handleStatusesはlistenerが維持されるdraining観測窓でも200を返し、admission状態とcleanup後のsession数を公開する。
//
// shutdown coordinatorはこのendpointでsessions=0を観測可能にしてからlistenerを停止する。
func (s *Server) handleStatuses(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	limit := 0
	if provider, ok := s.sessions.(interface{ Limit() int }); ok {
		limit = provider.Limit()
	}
	writeJSON(writer, http.StatusOK, statusResponse{
		Sessions: s.sessions.Count(), SessionLimit: limit, Ready: s.state.Ready(), Draining: s.state.Draining(),
	})
}

func (s *Server) handleLive(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writer.WriteHeader(http.StatusOK)
}

// handleReadyはlistenerの生存とは分離したadmission readinessを返す。
//
// BeginDrain後の観測窓ではlistenerがrequestを処理できても503となり、新規sessionへtrafficを送らせない。
func (s *Server) handleReady(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !s.state.Ready() {
		writer.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	writer.WriteHeader(http.StatusOK)
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

// responseBuffer holds the complete handler response until the request panic
// boundary decides whether it is safe to commit. It implements only the
// non-streaming ResponseWriter contract used by these finite JSON/static
// endpoints; handlers requiring Flusher or Hijacker must use another boundary.
type responseBuffer struct {
	header http.Header
	status int
	body   strings.Builder
}

func newResponseBuffer() *responseBuffer {
	return &responseBuffer{header: make(http.Header)}
}

func (b *responseBuffer) Header() http.Header { return b.header }
func (b *responseBuffer) WriteHeader(status int) {
	if b.status == 0 {
		b.status = status
	}
}
func (b *responseBuffer) Write(body []byte) (int, error) {
	if b.status == 0 {
		b.status = http.StatusOK
	}
	return b.body.Write(body)
}

// flush transfers headers, final status, and body to the network writer once.
// recoverHTTP deliberately never calls it after a panic, discarding all
// partially constructed success state before writing the replacement 500.
func (b *responseBuffer) flush(writer http.ResponseWriter) {
	for key, values := range b.header {
		for _, value := range values {
			writer.Header().Add(key, value)
		}
	}
	status := b.status
	if status == 0 {
		status = http.StatusOK
	}
	writer.WriteHeader(status)
	_, _ = io.WriteString(writer, b.body.String())
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (w *statusWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (s *Server) observeHTTP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if s.recorder == nil {
			next.ServeHTTP(writer, request)
			return
		}
		endpoint := signalingEndpoint(request.URL.Path)
		if endpoint == "" {
			next.ServeHTTP(writer, request)
			return
		}
		started := time.Now()
		captured := &statusWriter{ResponseWriter: writer}
		next.ServeHTTP(captured, request)
		status := captured.status
		if status == 0 {
			status = http.StatusOK
		}
		s.recorder.SignalingRequest(endpoint, fmt.Sprintf("%dxx", status/100), time.Since(started))
	})
}

func signalingEndpoint(path string) string {
	switch path {
	case configPath:
		return "config"
	case offerPath:
		return "offer"
	case candidatePath:
		return "candidate"
	case statusesPath:
		return "statuses"
	default:
		return ""
	}
}

// recoverHTTP keeps the entire non-streaming response uncommitted until the
// handler returns. Ordinary panics discard buffered headers/body and commit a
// fresh 500; successful responses flush once. The outer observeHTTP boundary
// records that committed result. Runtime fatal errors, cgo crashes, streaming,
// and failures outside this request goroutine remain unsupported.
func (s *Server) recoverHTTP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		buffered := newResponseBuffer()
		defer func() {
			if recover() != nil {
				s.logger.Error("http handler panic", "reason", "panic")
				writeError(writer, http.StatusInternalServerError, "Internal server error.")
				return
			}
			buffered.flush(writer)
		}()
		next.ServeHTTP(buffered, request)
	})
}

// withSessionMutation associates a panic after session lookup with the known
// owner before the outer HTTP boundary converts it to 500.
func (s *Server) withSessionMutation(sessionID string, mutate func()) {
	defer func() {
		if recovered := recover(); recovered != nil {
			if closer, ok := s.sessions.(interface{ CloseSession(string, string) }); ok {
				closer.CloseSession(sessionID, "panic")
			}
			panic(recovered)
		}
	}()
	mutate()
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
		slog.Error("write json response failed", "reason", "response_write_error")
	}
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}
