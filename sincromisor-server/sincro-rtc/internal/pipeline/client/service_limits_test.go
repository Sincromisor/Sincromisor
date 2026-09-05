package client

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

type limitClient struct {
	base    *baseClient
	connect func(context.Context) error
	close   func() error
}

func TestEveryServiceInboundLimitBoundary(t *testing.T) {
	for _, service := range serviceLimitCases() {
		service := service
		t.Run(string(service.name), func(t *testing.T) {
			for _, boundary := range []struct {
				name     string
				size     int
				wantKind EventKind
			}{
				{name: "exact", size: int(service.limit), wantKind: EventDecodeFailed},
				{name: "plus one", size: int(service.limit) + 1, wantKind: EventMessageTooLarge},
			} {
				t.Run(boundary.name, func(t *testing.T) {
					server, endpoint := websocketServer(t, func(
						ctx context.Context,
						conn *websocket.Conn,
						_ *http.Request,
					) {
						if service.name == ServiceExtractor {
							if _, _, err := conn.Read(ctx); err != nil {
								t.Errorf("read extractor initialization: %v", err)
								return
							}
						}
						_ = conn.Write(ctx, websocket.MessageBinary, make([]byte, boundary.size))
						waitForPeerClose(ctx, conn)
					})
					defer server.Close()
					client := service.newClient(t, endpoint)
					if err := client.connect(context.Background()); err != nil {
						t.Fatalf("Connect() error = %v", err)
					}
					assertSingleTerminalEvent(t, client.base.events, boundary.wantKind)
					if err := client.close(); err != nil {
						t.Fatalf("Close() error = %v", err)
					}
				})
			}
		})
	}
}

func TestEveryServiceOutboundLimitBoundary(t *testing.T) {
	for _, service := range serviceLimitCases() {
		service := service
		t.Run(string(service.name), func(t *testing.T) {
			received := make(chan int, 1)
			server, endpoint := websocketServer(t, func(
				ctx context.Context,
				conn *websocket.Conn,
				_ *http.Request,
			) {
				conn.SetReadLimit(service.limit + 1)
				if service.name == ServiceExtractor {
					if _, _, err := conn.Read(ctx); err != nil {
						t.Errorf("read extractor initialization: %v", err)
						return
					}
				}
				messageType, payload, err := conn.Read(ctx)
				if err != nil || messageType != websocket.MessageBinary {
					t.Errorf("read exact-limit payload = %v, %v", messageType, err)
					return
				}
				received <- len(payload)
				waitForPeerClose(ctx, conn)
			})
			defer server.Close()
			client := service.newClient(t, endpoint)
			if err := client.connect(context.Background()); err != nil {
				t.Fatalf("Connect() error = %v", err)
			}
			if err := client.base.send(context.Background(), make([]byte, service.limit)); err != nil {
				t.Fatalf("send(exact limit) error = %v", err)
			}
			select {
			case size := <-received:
				if int64(size) != service.limit {
					t.Fatalf("wire payload size = %d, want %d", size, service.limit)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("exact-limit wire payload timeout")
			}
			if err := client.base.send(context.Background(), make([]byte, service.limit+1)); err == nil {
				t.Fatal("send(limit+1) succeeded")
			}
			assertSingleTerminalEvent(t, client.base.events, EventMessageTooLarge)
			if err := client.close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
}

type serviceLimitCase struct {
	name      Service
	limit     int64
	newClient func(*testing.T, discovery.Endpoint) limitClient
}

func serviceLimitCases() []serviceLimitCase {
	return []serviceLimitCase{
		{
			name: ServiceExtractor, limit: extractorReadLimit,
			newClient: func(t *testing.T, endpoint discovery.Endpoint) limitClient {
				t.Helper()
				client, err := NewExtractor(
					limitTestConfig(), fakeResolver{endpoint: endpoint}, testLogger(), time.Now,
				)
				if err != nil {
					t.Fatalf("NewExtractor() error = %v", err)
				}
				return limitClient{base: client.baseClient, connect: client.Connect, close: client.Close}
			},
		},
		{
			name: ServiceRecognizer, limit: recognizerReadLimit,
			newClient: func(t *testing.T, endpoint discovery.Endpoint) limitClient {
				t.Helper()
				client, err := NewRecognizer(limitTestConfig(), fakeResolver{endpoint: endpoint}, testLogger())
				if err != nil {
					t.Fatalf("NewRecognizer() error = %v", err)
				}
				return limitClient{base: client.baseClient, connect: client.Connect, close: client.Close}
			},
		},
		{
			name: ServiceProcessor, limit: processorReadLimit,
			newClient: func(t *testing.T, endpoint discovery.Endpoint) limitClient {
				t.Helper()
				client, err := NewProcessor(limitTestConfig(), fakeResolver{endpoint: endpoint}, testLogger())
				if err != nil {
					t.Fatalf("NewProcessor() error = %v", err)
				}
				return limitClient{base: client.baseClient, connect: client.Connect, close: client.Close}
			},
		},
		{
			name: ServiceSynthesizer, limit: synthesizerReadLimit,
			newClient: func(t *testing.T, endpoint discovery.Endpoint) limitClient {
				t.Helper()
				client, err := NewSynthesizer(limitTestConfig(), fakeResolver{endpoint: endpoint}, testLogger())
				if err != nil {
					t.Fatalf("NewSynthesizer() error = %v", err)
				}
				return limitClient{base: client.baseClient, connect: client.Connect, close: client.Close}
			},
		},
	}
}

func limitTestConfig() Config {
	cfg := testConfig("chat")
	cfg.WriteTimeout = 10 * time.Second
	return cfg
}
