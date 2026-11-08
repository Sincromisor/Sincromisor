package signaling

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStaticAndAPIPrecedence(t *testing.T) {
	frontendDir := t.TempDir()
	fake := &fakeSessions{}
	offers := newTestOfferRegistry(t, fake, time.Second)
	server := New(fake, offers, frontendDir, "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	response := performRequest(server.Handler(), http.MethodGet, apiPrefix+"missing", "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown API status = %d, want 404", response.Code)
	}
}

// 静的配信は書き込み先へ逐次転送し、APIの応答バッファへ素材全体を複製しない。
func TestStaticAssetStreamsWithoutWholeResponseBuffer(t *testing.T) {
	frontendDir := t.TempDir()
	content := bytes.Repeat([]byte{42}, 128<<10)
	if err := os.WriteFile(filepath.Join(frontendDir, "asset.bin"), content, 0600); err != nil {
		t.Fatal(err)
	}
	fake := &fakeSessions{}
	server := New(fake, newTestOfferRegistry(t, fake, time.Second), frontendDir, "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	writer := &chunkResponseWriter{header: make(http.Header)}
	server.Handler().ServeHTTP(writer, httptest.NewRequest(http.MethodGet, "/asset.bin", nil))
	if writer.status != http.StatusOK || !bytes.Equal(writer.body.Bytes(), content) {
		t.Fatal("static content changed")
	}
	if writer.largest >= len(content) {
		t.Fatalf("whole asset buffered: largest write = %d", writer.largest)
	}
}

type chunkResponseWriter struct {
	header  http.Header
	status  int
	body    bytes.Buffer
	largest int
}

func (w *chunkResponseWriter) Header() http.Header    { return w.header }
func (w *chunkResponseWriter) WriteHeader(status int) { w.status = status }
func (w *chunkResponseWriter) Write(value []byte) (int, error) {
	w.largest = max(w.largest, len(value))
	return w.body.Write(value)
}
