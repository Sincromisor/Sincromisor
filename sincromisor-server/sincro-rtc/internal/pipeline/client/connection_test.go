package client

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestResultDeliveryCanCancelWithoutConsumer(t *testing.T) {
	results := make(chan protocol.ProcessorResult)
	deliver := decodeResults(results, protocol.DecodeProcessorResult)
	payload := fixture(t, "text_processor_result.msgpack")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- deliver(ctx, payload) }()
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("delivery error = %v, want context.Canceled", err)
		}
	case <-time.After(time.Second):
		t.Fatal("result delivery did not stop without a consumer")
	}
}

func TestLifecycleStateValidationAndParentCancellation(t *testing.T) {
	endpoint := discovery.Endpoint{Host: "127.0.0.1", Port: 1, Source: discovery.EndpointSourceConsul}
	client, err := NewRecognizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
	if err != nil {
		t.Fatalf("NewRecognizer() error = %v", err)
	}
	if err := client.SendExtraction(context.Background(), validExtraction()); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("send-before-open error = %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatalf("Close-before-Connect error = %v", err)
	}
	if err := client.Connect(context.Background()); !errors.Is(err, ErrClosed) {
		t.Fatalf("Connect-after-Close error = %v", err)
	}
	if err := client.SendExtraction(context.Background(), validExtraction()); !errors.Is(err, ErrClosed) {
		t.Fatalf("send-after-Close error = %v", err)
	}
	if _, ok := <-client.Results(); ok {
		t.Fatal("Results channel remains open")
	}
	if _, ok := <-client.Events(); ok {
		t.Fatal("Events channel remains open")
	}

	server, liveEndpoint := websocketServer(t, func(ctx context.Context, conn *websocket.Conn, _ *http.Request) {
		waitForPeerClose(ctx, conn)
	})
	defer server.Close()
	live, err := NewRecognizer(testConfig("chat"), fakeResolver{endpoint: liveEndpoint}, testLogger())
	if err != nil {
		t.Fatalf("NewRecognizer() error = %v", err)
	}
	parent, cancel := context.WithCancel(context.Background())
	if err := live.Connect(parent); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	if err := live.Connect(parent); !errors.Is(err, ErrAlreadyConnected) {
		t.Fatalf("second Connect() error = %v", err)
	}
	cancel()
	select {
	case event, ok := <-live.Events():
		if ok {
			t.Fatalf("parent cancellation emitted event: %+v", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("parent cancellation did not close channels")
	}
	if err := live.Close(); err != nil {
		t.Fatalf("Close() after parent cancellation error = %v", err)
	}
}

func TestConnectCloseRaceAndDialTimeoutConverge(t *testing.T) {
	t.Run("Close interrupts discovery", func(t *testing.T) {
		started := make(chan struct{})
		resolver := resolverFunc(func(ctx context.Context, _ discovery.Service) (discovery.Endpoint, error) {
			close(started)
			<-ctx.Done()
			return discovery.Endpoint{}, ctx.Err()
		})
		client, err := NewRecognizer(testConfig("chat"), resolver, testLogger())
		if err != nil {
			t.Fatalf("NewRecognizer() error = %v", err)
		}
		connectResult := make(chan error, 1)
		go func() { connectResult <- client.Connect(context.Background()) }()
		<-started
		if err := client.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if err := <-connectResult; !errors.Is(err, ErrClosed) {
			t.Fatalf("Connect() error = %v, want ErrClosed", err)
		}
	})

	t.Run("dial timeout closes channels", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			time.Sleep(200 * time.Millisecond)
		}))
		defer server.Close()
		parsed, err := url.Parse(server.URL)
		if err != nil {
			t.Fatalf("parse server URL: %v", err)
		}
		host, rawPort, err := net.SplitHostPort(parsed.Host)
		if err != nil {
			t.Fatalf("split server URL: %v", err)
		}
		port, err := net.LookupPort("tcp", rawPort)
		if err != nil {
			t.Fatalf("parse port: %v", err)
		}
		cfg := testConfig("chat")
		cfg.DialTimeout = 20 * time.Millisecond
		client, err := NewRecognizer(cfg, fakeResolver{endpoint: discovery.Endpoint{
			Host: host, Port: uint16(port), Source: discovery.EndpointSourceConsul,
		}}, testLogger())
		if err != nil {
			t.Fatalf("NewRecognizer() error = %v", err)
		}
		if err := client.Connect(context.Background()); err == nil {
			t.Fatal("Connect() succeeded")
		}
		if _, ok := <-client.Results(); ok {
			t.Fatal("Results channel remains open")
		}
		if _, ok := <-client.Events(); ok {
			t.Fatal("Events channel remains open")
		}
	})
}
