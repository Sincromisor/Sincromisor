package client

import (
	"bytes"
	"context"
	"errors"
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

func TestTypedClientsUseFixedEndpointsAndBinaryContracts(t *testing.T) {
	t.Run("extractor initialization precedes PCM", func(t *testing.T) {
		response := fixture(t, "extractor_result.msgpack")
		server, endpoint := websocketServer(t, func(ctx context.Context, conn *websocket.Conn, request *http.Request) {
			if request.URL.Path != "/api/v1/SpeechExtractor/extract" ||
				request.URL.Query().Get("max_silence_ms") != "1000" {
				t.Errorf("unexpected extractor URL: %s", request.URL.String())
			}
			messageType, initialize, err := conn.Read(ctx)
			if err != nil || messageType != websocket.MessageBinary {
				t.Errorf("read initialize = %v, %v", messageType, err)
				return
			}
			if !bytes.Contains(initialize, []byte("fixture-session")) {
				t.Error("initialize payload does not contain session")
			}
			messageType, pcm, err := conn.Read(ctx)
			if err != nil || messageType != websocket.MessageBinary || len(pcm) != pcmFrameBytes {
				t.Errorf("read PCM len=%d type=%v err=%v", len(pcm), messageType, err)
				return
			}
			if err := conn.Write(ctx, websocket.MessageBinary, response); err != nil {
				t.Errorf("write response: %v", err)
			}
			waitForPeerClose(ctx, conn)
		})
		defer server.Close()

		client, err := NewExtractor(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger(), func() time.Time {
			return time.Unix(1_700_000_000, 125_000_000)
		})
		if err != nil {
			t.Fatalf("NewExtractor() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		result := make(chan protocol.ExtractorResult, 1)
		go func() { result <- <-client.Results() }()
		if err := client.SendPCM(context.Background(), make([]byte, pcmFrameBytes)); err != nil {
			t.Fatalf("SendPCM() error = %v", err)
		}
		if got := receive(t, result); got.SessionID != "fixture-session" {
			t.Fatalf("result session = %q", got.SessionID)
		}
		closeTwice(t, client.Close)
	})

	t.Run("recognizer", func(t *testing.T) {
		response := fixture(t, "recognizer_result.msgpack")
		server, endpoint := websocketServer(t, binaryExchangeHandler(
			t, "/api/v1/SpeechRecognizer/recognize", response,
		))
		defer server.Close()
		client, err := NewRecognizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
		if err != nil {
			t.Fatalf("NewRecognizer() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		result := make(chan protocol.RecognizerResult, 1)
		go func() { result <- <-client.Results() }()
		err = client.SendExtraction(context.Background(), protocol.ExtractorResult{
			SessionID: "fixture-session", SpeechID: 42, SequenceID: 7, Voice: []byte{0, 0},
			VoiceDType: "int16", VoiceSamplingRate: 16_000, VoiceSampleBytes: 2, VoiceChannels: 1,
		})
		if err != nil {
			t.Fatalf("SendExtraction() error = %v", err)
		}
		if got := receive(t, result); got.SpeechID != 42 {
			t.Fatalf("result speech ID = %d", got.SpeechID)
		}
		closeTwice(t, client.Close)
	})

	t.Run("processor talk mode path", func(t *testing.T) {
		response := fixture(t, "text_processor_result.msgpack")
		server, endpoint := websocketServer(t, binaryExchangeHandler(
			t, "/api/v1/TextProcessor/sincro", response,
		))
		defer server.Close()
		client, err := NewProcessor(testConfig("sincro"), fakeResolver{endpoint: endpoint}, testLogger())
		if err != nil {
			t.Fatalf("NewProcessor() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		result := make(chan protocol.ProcessorResult, 1)
		go func() { result <- <-client.Results() }()
		err = client.SendRequest(context.Background(), protocol.ProcessorRequest{
			SessionID: "fixture-session", SequenceID: 7, Confirmed: true,
			History:        protocol.ChatHistory{Messages: []protocol.ChatMessage{}},
			RequestMessage: protocol.ChatMessage{},
		})
		if err != nil {
			t.Fatalf("SendRequest() error = %v", err)
		}
		if got := receive(t, result); len(got.Raw) == 0 {
			t.Fatal("processor result Raw is empty")
		}
		closeTwice(t, client.Close)
	})

	t.Run("synthesizer forwards processor Raw unchanged", func(t *testing.T) {
		response := fixture(t, "voice_synthesizer_result.msgpack")
		wantRequest := fixture(t, "text_processor_result.msgpack")
		server, endpoint := websocketServer(t, func(ctx context.Context, conn *websocket.Conn, request *http.Request) {
			if request.URL.Path != "/api/v1/VoiceSynthesizer/synthesize" {
				t.Errorf("path = %q", request.URL.Path)
			}
			messageType, payload, err := conn.Read(ctx)
			if err != nil || messageType != websocket.MessageBinary {
				t.Errorf("read request = %v, %v", messageType, err)
				return
			}
			if !bytes.Equal(payload, wantRequest) {
				t.Error("synthesizer request was re-encoded or changed")
			}
			if err := conn.Write(ctx, websocket.MessageBinary, response); err != nil {
				t.Errorf("write response: %v", err)
			}
			waitForPeerClose(ctx, conn)
		})
		defer server.Close()
		client, err := NewSynthesizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
		if err != nil {
			t.Fatalf("NewSynthesizer() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		result := make(chan protocol.SynthesizerResult, 1)
		go func() { result <- <-client.Results() }()
		processor, err := protocol.DecodeProcessorResult(wantRequest)
		if err != nil {
			t.Fatalf("DecodeProcessorResult() error = %v", err)
		}
		if err := client.SendResult(context.Background(), processor); err != nil {
			t.Fatalf("SendResult() error = %v", err)
		}
		if got := receive(t, result); got.SpeechID != 42 {
			t.Fatalf("result speech ID = %d", got.SpeechID)
		}
		closeTwice(t, client.Close)
	})
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

func TestOutboundLimitClosesConnectionWithTypedEvent(t *testing.T) {
	server, endpoint := websocketServer(t, func(ctx context.Context, conn *websocket.Conn, _ *http.Request) {
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
	extraction := validExtraction()
	extraction.Voice = make([]byte, recognizerReadLimit)
	if err := client.SendExtraction(context.Background(), extraction); err == nil {
		t.Fatal("SendExtraction() succeeded")
	}
	select {
	case event := <-client.Events():
		if event.Kind != EventMessageTooLarge {
			t.Fatalf("Event.Kind = %q", event.Kind)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("terminal event timeout")
	}
	if err := client.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestConstructorsRejectInvalidConfigurationAndRequests(t *testing.T) {
	cfg := testConfig("chat")
	cfg.WriteTimeout = 0
	if _, err := NewRecognizer(cfg, fakeResolver{}, testLogger()); err == nil {
		t.Fatal("NewRecognizer() accepted zero timeout")
	}
	if _, err := NewExtractor(testConfig("other"), fakeResolver{}, testLogger(), time.Now); err == nil {
		t.Fatal("NewExtractor() accepted unsupported mode")
	}
	if _, err := NewProcessor(testConfig("other"), fakeResolver{}, testLogger()); err == nil {
		t.Fatal("NewProcessor() accepted unsupported mode")
	}
	if _, err := NewSynthesizer(testConfig("chat"), fakeResolver{}, nil); err == nil {
		t.Fatal("NewSynthesizer() accepted nil logger")
	}
}

func TestReadLimitClassification(t *testing.T) {
	tests := []struct {
		name string
		size int
		kind EventKind
	}{
		{name: "exact limit reaches decoder", size: int(extractorReadLimit), kind: EventDecodeFailed},
		{name: "limit plus one is typed", size: int(extractorReadLimit) + 1, kind: EventMessageTooLarge},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server, endpoint := websocketServer(t, func(ctx context.Context, conn *websocket.Conn, _ *http.Request) {
				if _, _, err := conn.Read(ctx); err != nil {
					t.Errorf("read initialization: %v", err)
					return
				}
				if err := conn.Write(ctx, websocket.MessageBinary, make([]byte, test.size)); err != nil {
					return
				}
				waitForPeerClose(ctx, conn)
			})
			defer server.Close()
			client, err := NewExtractor(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger(), time.Now)
			if err != nil {
				t.Fatalf("NewExtractor() error = %v", err)
			}
			if err := client.Connect(context.Background()); err != nil {
				t.Fatalf("Connect() error = %v", err)
			}
			select {
			case event := <-client.Events():
				if event.Kind != test.kind {
					t.Fatalf("Event.Kind = %q, want %q (err=%v)", event.Kind, test.kind, event.Err)
				}
			case <-time.After(3 * time.Second):
				t.Fatal("terminal event timeout")
			}
			if err := client.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
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
