package signaling

import (
	"net/http"
	"sync/atomic"
)

// ProcessState は状態確認と安全な終了が共有するプロセス受付状態である。
// 起動時は全ローカル依存の検証後だけ準備完了とし、終了開始後のdrainingはプロセス終了まで戻さない。
type ProcessState struct {
	ready    atomic.Bool
	draining atomic.Bool
}

// NewProcessState は未準備かつ終了未開始の起動状態を返す。
func NewProcessState() *ProcessState { return &ProcessState{} }

// MarkReady は起動検証の成功を公開する。
func (s *ProcessState) MarkReady() { s.ready.Store(true) }

// BeginDrain はprocess ownerをcancelする前にready=falseと単調なdraining状態を公開する。
// process coordinatorは受付拒否観測窓の間HTTP listenerを維持し、新規initial Offerへ
// 接続拒否ではなく503を返せる状態にする。
func (s *ProcessState) BeginDrain() { s.draining.Store(true); s.ready.Store(false) }

// Ready は新規Sessionを安全に受け付けられるかを返す。
func (s *ProcessState) Ready() bool { return s.ready.Load() && !s.draining.Load() }

// Draining は終了時の受付制御を開始済みかを返す。
func (s *ProcessState) Draining() bool { return s.draining.Load() }

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
