package client

import (
	"bytes"
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

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
