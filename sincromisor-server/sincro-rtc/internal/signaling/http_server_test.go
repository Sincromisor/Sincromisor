package signaling

import (
	"io"
	"log/slog"
	"net/http"
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
