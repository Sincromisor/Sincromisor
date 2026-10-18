package client

import (
	"context"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// 本番クライアントの8要求枠待ちで、文章処理側のPongが遅れることと再開を調べる。
// overlayでclientパッケージへ加え、既存のWebSocket試験補助だけを再利用する。
func TestEvaluationProcessorPingWhileSynthesisWindowFull(t *testing.T) {
	for _, boundedPong := range []bool{true, false} {
		name := "Pong期限ありで旧障害を再現"
		if !boundedPong {
			name = "Pong期限なしで待機解除後に継続"
		}
		t.Run(name, func(t *testing.T) { evaluateProcessorPing(t, boundedPong) })
	}
}

func evaluateProcessorPing(t *testing.T, boundedPong bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pingNow := make(chan struct{})
	pingResult := make(chan error, 1)
	value := processorResultWithPadding(t, 0)
	processorServer, processorEndpoint := websocketServer(t, func(serverCtx context.Context, conn *websocket.Conn, _ *http.Request) {
		// PingのPongをサーバー自身が読まないことによる誤検知を避ける。
		readDone := make(chan struct{})
		go func() { defer close(readDone); waitForPeerClose(serverCtx, conn) }()
		defer func() { _ = conn.CloseNow(); <-readDone }()
		for range 10 {
			if err := conn.Write(serverCtx, websocket.MessageBinary, value.Raw); err != nil {
				t.Errorf("processor write: %v", err)
				return
			}
		}
		select {
		case <-pingNow:
		case <-ctx.Done():
			return
		}
		pingCtx := serverCtx
		if boundedPong {
			var stop context.CancelFunc
			pingCtx, stop = context.WithTimeout(serverCtx, 150*time.Millisecond)
			defer stop()
		}
		pingResult <- conn.Ping(pingCtx)
		<-ctx.Done()
	})
	defer processorServer.Close()
	eightRequests := make(chan struct{})
	releaseCompletion := make(chan struct{})
	synthServer, synthEndpoint := websocketServer(t, func(serverCtx context.Context, conn *websocket.Conn, _ *http.Request) {
		for range 8 {
			if _, _, err := conn.Read(serverCtx); err != nil {
				t.Errorf("synthesis request read: %v", err)
				return
			}
		}
		close(eightRequests)
		// 長い先頭要求が再生へ流れる間、終端はまだ到着していない状態を保つ。
		select {
		case <-releaseCompletion:
		case <-ctx.Done():
			return
		}
		first, err := protocol.DecodeSynthesizerChunk(fixture(t, "voice_synthesizer_chunk.msgpack"))
		if err != nil {
			t.Error(err)
			return
		}
		final := protocol.SynthesizerChunk{RequestID: 1, SpeechID: 42, Sequence: 1, SampleOffset: int64(len(first.PCM) / 2), Final: true, PCM: []byte{}, MoraQueue: []protocol.SynthesizerMora{}}
		for _, chunk := range []protocol.SynthesizerChunk{first, final} {
			payload, err := msgpack.Marshal(chunk)
			if err != nil {
				t.Error(err)
				return
			}
			if err := conn.Write(serverCtx, websocket.MessageBinary, payload); err != nil {
				t.Error(err)
				return
			}
		}
		for {
			if _, _, err := conn.Read(serverCtx); err != nil {
				return
			}
		}
	})
	defer synthServer.Close()
	processor, err := NewProcessor(testConfig("chat"), fakeResolver{endpoint: processorEndpoint}, testLogger())
	if err != nil {
		t.Fatal(err)
	}
	synth, err := NewSynthesizer(testConfig("chat"), fakeResolver{endpoint: synthEndpoint}, testLogger())
	if err != nil {
		t.Fatal(err)
	}
	tenthDelivery := make(chan struct{})
	originalDecode := processor.decode
	var decoded atomic.Int64
	processor.decode = func(ctx context.Context, payload []byte) error {
		if decoded.Add(1) == 10 {
			close(tenthDelivery)
		}
		return originalDecode(ctx, payload)
	}
	if err := synth.Connect(ctx); err != nil {
		t.Fatal(err)
	}
	defer synth.Close()
	if err := processor.Connect(ctx); err != nil {
		t.Fatal(err)
	}
	defer processor.Close()
	forwardDone := make(chan struct{})
	go func() {
		defer close(forwardDone)
		for result := range processor.Results() {
			if synth.SendResult(ctx, result) != nil {
				return
			}
		}
	}()
	consumeDone := make(chan struct{})
	go func() {
		defer close(consumeDone)
		for range synth.Results() {
		}
	}()
	defer func() { cancel(); <-forwardDone; <-consumeDone }()
	for _, ready := range []<-chan struct{}{eightRequests, tenthDelivery} {
		select {
		case <-ready:
		case <-ctx.Done():
			t.Fatal("did not reach the full-window delivery wait")
		}
	}
	close(pingNow)
	if boundedPong {
		if err := receive(t, pingResult); err == nil {
			t.Fatal("old bounded Pong policy did not reproduce the stalled-reader failure")
		} else {
			t.Logf("old failure reproduced: %v", err)
		}
		return
	}
	select {
	case err := <-pingResult:
		t.Fatalf("Ping returned before synthesis wait was released: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	close(releaseCompletion)
	// 1件の完了で9件目が進む。10件目は次の完了待ちへ入り、次の受信がないためPongを処理できる。
	if err := receive(t, pingResult); err != nil {
		t.Fatalf("Pong after completion: %v", err)
	}
	select {
	case event := <-processor.Events():
		t.Fatalf("processor failed after resuming: %v", event)
	default:
	}
}
