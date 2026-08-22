package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func TestExtractorInitializationUsesExactDTOClockOnce(t *testing.T) {
	initializePayload := make(chan []byte, 1)
	secondPayload := make(chan []byte, 1)
	server, endpoint := websocketServer(t, func(
		ctx context.Context,
		conn *websocket.Conn,
		_ *http.Request,
	) {
		messageType, payload, err := conn.Read(ctx)
		if err != nil || messageType != websocket.MessageBinary {
			t.Errorf("read initialization = %v, %v", messageType, err)
			return
		}
		initializePayload <- payload
		messageType, payload, err = conn.Read(ctx)
		if err != nil || messageType != websocket.MessageBinary {
			t.Errorf("read PCM = %v, %v", messageType, err)
			return
		}
		secondPayload <- payload
		waitForPeerClose(ctx, conn)
	})
	defer server.Close()
	clockCalls := 0
	client, err := NewExtractor(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger(), func() time.Time {
		clockCalls++
		return time.Unix(1_700_000_000, 125_000_000)
	})
	if err != nil {
		t.Fatalf("NewExtractor() error = %v", err)
	}
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	if err := client.SendPCM(context.Background(), make([]byte, pcmFrameBytes)); err != nil {
		t.Fatalf("SendPCM() error = %v", err)
	}

	var initialize protocol.ExtractorInitialize
	if err := msgpack.Unmarshal(receive(t, initializePayload), &initialize); err != nil {
		t.Fatalf("decode initialization: %v", err)
	}
	want := protocol.ExtractorInitialize{
		SessionID: "fixture-session", StartAt: 1_700_000_000.125,
		VoiceSamplingRate: 16_000, VoiceSampleBytes: 2, VoiceChannels: 1,
	}
	if initialize != want {
		t.Fatalf("initialize = %+v, want %+v", initialize, want)
	}
	if clockCalls != 1 {
		t.Fatalf("clock calls = %d, want 1", clockCalls)
	}
	if len(receive(t, secondPayload)) != pcmFrameBytes {
		t.Fatal("second application message was not the PCM frame")
	}
	if err := client.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestInvalidInputsAreRejectedBeforeWireWrite(t *testing.T) {
	t.Run("extractor PCM", func(t *testing.T) {
		server, endpoint, inspect, observed := noAdditionalWireServer(t, 1)
		defer server.Close()
		client, err := NewExtractor(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger(), time.Now)
		if err != nil {
			t.Fatalf("NewExtractor() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		for _, frame := range [][]byte{nil, make([]byte, 639), make([]byte, 638), make([]byte, 642)} {
			if err := client.SendPCM(context.Background(), frame); err == nil {
				t.Fatalf("SendPCM(len=%d) succeeded", len(frame))
			}
		}
		assertNoAdditionalWire(t, inspect, observed)
		_ = client.Close()
	})

	t.Run("recognizer fields", func(t *testing.T) {
		server, endpoint, inspect, observed := noAdditionalWireServer(t, 0)
		defer server.Close()
		client, err := NewRecognizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
		if err != nil {
			t.Fatalf("NewRecognizer() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		valid := validExtraction()
		invalid := []protocol.ExtractorResult{
			func() protocol.ExtractorResult { value := valid; value.SessionID = "other"; return value }(),
			func() protocol.ExtractorResult { value := valid; value.SpeechID = -1; return value }(),
			func() protocol.ExtractorResult { value := valid; value.SequenceID = -1; return value }(),
			func() protocol.ExtractorResult { value := valid; value.VoiceDType = "float32"; return value }(),
			func() protocol.ExtractorResult { value := valid; value.VoiceSamplingRate = 48_000; return value }(),
			func() protocol.ExtractorResult { value := valid; value.VoiceSampleBytes = 4; return value }(),
			func() protocol.ExtractorResult { value := valid; value.VoiceChannels = 2; return value }(),
			func() protocol.ExtractorResult { value := valid; value.Voice = nil; return value }(),
		}
		for index, value := range invalid {
			if err := client.SendExtraction(context.Background(), value); err == nil {
				t.Fatalf("SendExtraction(invalid=%d) succeeded", index)
			}
		}
		assertNoAdditionalWire(t, inspect, observed)
		_ = client.Close()
	})

	t.Run("processor session", func(t *testing.T) {
		server, endpoint, inspect, observed := noAdditionalWireServer(t, 0)
		defer server.Close()
		client, err := NewProcessor(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
		if err != nil {
			t.Fatalf("NewProcessor() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		invalid := []protocol.ProcessorRequest{
			{
				SessionID: "other",
				History:   protocol.ChatHistory{Messages: []protocol.ChatMessage{}},
			},
			{
				SessionID: "fixture-session",
				History:   protocol.ChatHistory{Messages: nil},
			},
		}
		for index, request := range invalid {
			if err := client.SendRequest(context.Background(), request); err == nil {
				t.Fatalf("SendRequest(invalid=%d) succeeded", index)
			}
		}
		assertNoAdditionalWire(t, inspect, observed)
		_ = client.Close()
	})

	t.Run("synthesizer Raw provenance and session", func(t *testing.T) {
		server, endpoint, inspect, observed := noAdditionalWireServer(t, 0)
		defer server.Close()
		client, err := NewSynthesizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
		if err != nil {
			t.Fatalf("NewSynthesizer() error = %v", err)
		}
		if err := client.Connect(context.Background()); err != nil {
			t.Fatalf("Connect() error = %v", err)
		}
		valid, err := protocol.DecodeProcessorResult(fixture(t, "text_processor_result.msgpack"))
		if err != nil {
			t.Fatalf("DecodeProcessorResult() error = %v", err)
		}
		invalid := []protocol.ProcessorResult{
			{},
			{SessionID: "fixture-session", Raw: []byte("not-msgpack")},
			func() protocol.ProcessorResult { value := valid; value.SessionID = "other"; return value }(),
		}
		for index, value := range invalid {
			if err := client.SendResult(context.Background(), value); err == nil {
				t.Fatalf("SendResult(invalid=%d) succeeded", index)
			}
		}
		assertNoAdditionalWire(t, inspect, observed)
		_ = client.Close()
	})
}

func noAdditionalWireServer(
	t *testing.T,
	initialMessages int,
) (*httptest.Server, discovery.Endpoint, chan<- struct{}, <-chan bool) {
	t.Helper()
	inspect := make(chan struct{})
	observed := make(chan bool, 1)
	server, endpoint := websocketServer(t, func(
		ctx context.Context,
		conn *websocket.Conn,
		_ *http.Request,
	) {
		for index := 0; index < initialMessages; index++ {
			if messageType, _, err := conn.Read(ctx); err != nil || messageType != websocket.MessageBinary {
				t.Errorf("read initial message %d = %v, %v", index, messageType, err)
				return
			}
		}
		<-inspect
		readCtx, cancel := context.WithTimeout(ctx, 50*time.Millisecond)
		defer cancel()
		_, _, err := conn.Read(readCtx)
		observed <- err == nil
	})
	return server, endpoint, inspect, observed
}

func assertNoAdditionalWire(
	t *testing.T,
	inspect chan<- struct{},
	observed <-chan bool,
) {
	t.Helper()
	inspect <- struct{}{}
	select {
	case wrote := <-observed:
		if wrote {
			t.Fatal("invalid input reached the WebSocket wire")
		}
	case <-time.After(time.Second):
		t.Fatal("wire observation timeout")
	}
}
