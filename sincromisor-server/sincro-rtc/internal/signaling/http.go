// Package signaling は既存 Frontend RTC HTTP 契約と Pion session manager を接続する。
package signaling

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/signaling/offer"
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
	offers       *offer.Registry
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

// Options は通信試験が使う既存コンストラクター形状を変えず、状態確認と観測を追加する。
type Options struct {
	State    *ProcessState
	Recorder observability.Recorder
	Metrics  http.Handler
}

// New は signaling handler、initial Offer registry、session dependencyを固定する。
//
// frontendDir の存在確認は config.Load の起動時境界で完了済みである。New は listener を開かず、
// caller が Handler を http.Server へ渡すまで外部副作用を持たない。candidate gatheringのownerと
// timeoutはoffer.Registryがプロセス生存期間内で所有する。
func New(
	sessions SessionService,
	offers *offer.Registry,
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
	// 観測処理を最外層の応答確定担当にする。recoverHTTPは正常応答またはpanic時の500を確定してから戻るため、
	// 各シグナリング要求は最終状態と所要時間を必ず1回だけ記録する。
	return s.observeHTTP(s.recoverHTTP(mux))
}
