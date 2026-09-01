package signaling

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type statusWriter struct {
	http.ResponseWriter
	status int
}

// responseBuffer は要求のpanic境界が確定可否を判断するまで応答全体を保持する。
// 有限JSONと静的配信が使う非ストリーミングResponseWriterだけを実装し、
// FlusherまたはHijackerを必要とする処理は対象にしない。
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

// flush はヘッダー、最終状態、本文をネットワーク応答へ一度だけ移す。
// recoverHTTPはpanic後に呼ばず、作成途中の正常応答を破棄して500へ置き換える。
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

// recoverHTTP は処理が戻るまで非ストリーミング応答を確定しない。
// panic時は保持中の応答を破棄して500を返し、成功時だけ一度転送する。外側のobserveHTTPは確定結果を記録する。
// 実行時の致命的エラー、cgo障害、ストリーミング、要求担当外の失敗は対象外である。
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

// withSessionMutation はSession特定後のpanicを既知の所有者へ通知してから、外側のHTTP境界で500へ変換する。
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
