package client

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestReaderTerminalFailuresAreTypedAndEmittedOnce(t *testing.T) {
	tests := []struct {
		name     string
		serverIO func(context.Context, *websocket.Conn)
		wantKind EventKind
	}{
		{
			name: "remote close",
			serverIO: func(_ context.Context, conn *websocket.Conn) {
				_ = conn.Close(websocket.StatusGoingAway, "")
			},
			wantKind: EventRemoteClose,
		},
		{
			name: "decode error",
			serverIO: func(ctx context.Context, conn *websocket.Conn) {
				_ = conn.Write(ctx, websocket.MessageBinary, []byte{0xc1})
			},
			wantKind: EventDecodeFailed,
		},
		{
			name: "text message",
			serverIO: func(ctx context.Context, conn *websocket.Conn) {
				_ = conn.Write(ctx, websocket.MessageText, []byte("not-binary"))
			},
			wantKind: EventReadFailed,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server, endpoint := websocketServer(t, func(
				ctx context.Context,
				conn *websocket.Conn,
				_ *http.Request,
			) {
				test.serverIO(ctx, conn)
				waitForPeerClose(ctx, conn)
			})
			defer server.Close()
			client, err := NewRecognizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
			if err != nil {
				t.Fatalf("NewRecognizer() error = %v", err)
			}
			if err := client.Connect(context.Background()); err != nil {
				t.Fatalf("Connect() error = %v", err)
			}
			assertSingleTerminalEvent(t, client.Events(), test.wantKind)
			if err := client.SendExtraction(context.Background(), validExtraction()); !errors.Is(err, ErrClosed) {
				t.Fatalf("send-after-terminal error = %v, want ErrClosed", err)
			}
			if err := client.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
}

func TestNonReadingPeerDoesNotEmitTerminalEventAndCanClose(t *testing.T) {
	release := make(chan struct{})
	server, endpoint := websocketServer(t, func(
		context.Context,
		*websocket.Conn,
		*http.Request,
	) {
		<-release
	})
	defer server.Close()
	cfg := testConfig("chat")
	cfg.CloseTimeout = 20 * time.Millisecond
	client, err := NewRecognizer(cfg, fakeResolver{endpoint: endpoint}, testLogger())
	if err != nil {
		t.Fatalf("NewRecognizer() error = %v", err)
	}
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	select {
	case event, ok := <-client.Events():
		if ok {
			t.Fatalf("unexpected terminal event = %+v", event)
		}
		t.Fatal("Events channel closed before explicit Close")
	case <-time.After(50 * time.Millisecond):
	}
	if err := client.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	close(release)
}

func TestWriteTimeoutIsTerminalAndDoesNotLeaveHelper(t *testing.T) {
	release := make(chan struct{})
	server, endpoint := websocketServer(t, func(
		context.Context,
		*websocket.Conn,
		*http.Request,
	) {
		<-release
	})
	defer server.Close()
	cfg := testConfig("chat")
	cfg.WriteTimeout = 20 * time.Millisecond
	client, err := NewSynthesizer(cfg, fakeResolver{endpoint: endpoint}, testLogger())
	if err != nil {
		t.Fatalf("NewSynthesizer() error = %v", err)
	}
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	value := processorResultWithPadding(t, 31<<20)
	if err := client.SendResult(context.Background(), value); err == nil {
		t.Fatal("SendResult() succeeded against a non-reading peer")
	}
	assertSingleTerminalEvent(t, client.Events(), EventWriteFailed)
	close(release)
	if err := client.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestDefaultConfigIsProductionTimeoutSource(t *testing.T) {
	cfg := DefaultConfig("session", "chat")
	if cfg.DialTimeout != 5*time.Second ||
		cfg.WriteTimeout != 5*time.Second ||
		cfg.CloseTimeout != 2*time.Second {
		t.Fatalf("DefaultConfig() timeouts = %+v", cfg)
	}
	if cfg.SessionID != "session" || cfg.TalkMode != "chat" {
		t.Fatalf("DefaultConfig() routing fields = %+v", cfg)
	}
}

func TestTerminalEventIsOnceUnderConcurrentSources(t *testing.T) {
	release := make(chan struct{})
	server, endpoint := websocketServer(t, func(
		context.Context,
		*websocket.Conn,
		*http.Request,
	) {
		<-release
	})
	defer server.Close()
	client, err := NewRecognizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
	if err != nil {
		t.Fatalf("NewRecognizer() error = %v", err)
	}
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	kinds := []EventKind{
		EventRemoteClose, EventReadFailed,
		EventWriteFailed, EventDecodeFailed, EventMessageTooLarge,
	}
	var senders sync.WaitGroup
	senders.Add(len(kinds))
	for _, kind := range kinds {
		kind := kind
		go func() {
			defer senders.Done()
			client.base.terminal(kind, errors.New("competing terminal source"))
		}()
	}
	senders.Wait()
	select {
	case event, ok := <-client.Events():
		if !ok {
			t.Fatal("Events channel closed without terminal event")
		}
		if event.Service != ServiceRecognizer {
			t.Fatalf("Event.Service = %q", event.Service)
		}
	case <-time.After(time.Second):
		t.Fatal("terminal event timeout")
	}
	if _, ok := <-client.Events(); ok {
		t.Fatal("more than one terminal event was emitted")
	}
	close(release)
	if err := client.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func processorResultWithPadding(t *testing.T, paddingBytes int) protocol.ProcessorResult {
	t.Helper()
	payload := fixture(t, "text_processor_result.msgpack")
	var root map[string]any
	if err := msgpack.Unmarshal(payload, &root); err != nil {
		t.Fatalf("decode processor fixture map: %v", err)
	}
	root["future_padding"] = make([]byte, paddingBytes)
	payload, err := msgpack.Marshal(root)
	if err != nil {
		t.Fatalf("encode padded processor result: %v", err)
	}
	result, err := protocol.DecodeProcessorResult(payload)
	if err != nil {
		t.Fatalf("DecodeProcessorResult() error = %v", err)
	}
	return result
}

func assertSingleTerminalEvent(t *testing.T, events <-chan Event, want EventKind) {
	t.Helper()
	select {
	case event, ok := <-events:
		if !ok {
			t.Fatal("Events channel closed without terminal event")
		}
		if event.Kind != want {
			t.Fatalf("Event.Kind = %q, want %q (err=%v)", event.Kind, want, event.Err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("terminal event timeout")
	}
	select {
	case event, ok := <-events:
		if ok {
			t.Fatalf("second terminal event = %+v", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Events channel did not close after the single terminal event")
	}
}
