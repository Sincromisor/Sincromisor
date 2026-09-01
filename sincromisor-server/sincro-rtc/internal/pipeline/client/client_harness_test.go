package client

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

type fakeResolver struct {
	endpoint discovery.Endpoint
	err      error
}

func (r fakeResolver) Resolve(context.Context, discovery.Service) (discovery.Endpoint, error) {
	return r.endpoint, r.err
}

type resolverFunc func(context.Context, discovery.Service) (discovery.Endpoint, error)

func (resolve resolverFunc) Resolve(
	ctx context.Context,
	service discovery.Service,
) (discovery.Endpoint, error) {
	return resolve(ctx, service)
}

func websocketServer(
	t *testing.T,
	handler func(context.Context, *websocket.Conn, *http.Request),
) (*httptest.Server, discovery.Endpoint) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		conn, err := websocket.Accept(writer, request, nil)
		if err != nil {
			t.Errorf("Accept() error = %v", err)
			return
		}
		defer conn.CloseNow()
		handler(request.Context(), conn, request)
	}))
	parsed, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse test server URL: %v", err)
	}
	host, rawPort, err := net.SplitHostPort(parsed.Host)
	if err != nil {
		t.Fatalf("split test server host: %v", err)
	}
	port, err := net.LookupPort("tcp", rawPort)
	if err != nil {
		t.Fatalf("parse test server port: %v", err)
	}
	return server, discovery.Endpoint{
		Host: host, Port: uint16(port), Source: discovery.EndpointSourceConsul,
	}
}

func binaryExchangeHandler(
	t *testing.T,
	wantPath string,
	response []byte,
) func(context.Context, *websocket.Conn, *http.Request) {
	t.Helper()
	return func(ctx context.Context, conn *websocket.Conn, request *http.Request) {
		if request.URL.Path != wantPath {
			t.Errorf("path = %q, want %q", request.URL.Path, wantPath)
		}
		messageType, _, err := conn.Read(ctx)
		if err != nil || messageType != websocket.MessageBinary {
			t.Errorf("read request = %v, %v", messageType, err)
			return
		}
		if err := conn.Write(ctx, websocket.MessageBinary, response); err != nil {
			t.Errorf("write response: %v", err)
		}
		waitForPeerClose(ctx, conn)
	}
}

func waitForPeerClose(ctx context.Context, conn *websocket.Conn) {
	_, _, _ = conn.Read(ctx)
}

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join("..", "protocol", "testdata", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return payload
}

func testConfig(talkMode string) Config {
	return Config{
		SessionID: "fixture-session", TalkMode: talkMode,
		DialTimeout: time.Second, WriteTimeout: time.Second,
		CloseTimeout: time.Second,
	}
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func validExtraction() protocol.ExtractorResult {
	return protocol.ExtractorResult{
		SessionID: "fixture-session", SpeechID: 1, SequenceID: 1, Voice: []byte{0, 0},
		VoiceDType: "int16", VoiceSamplingRate: 16_000, VoiceSampleBytes: 2, VoiceChannels: 1,
	}
}

func closeTwice(t *testing.T, close func() error) {
	t.Helper()
	if err := close(); err != nil {
		t.Fatalf("first Close() error = %v", err)
	}
	if err := close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}
}

func receive[T any](t *testing.T, channel <-chan T) T {
	t.Helper()
	select {
	case value := <-channel:
		return value
	case <-time.After(2 * time.Second):
		t.Fatal("result timeout")
		var zero T
		return zero
	}
}
