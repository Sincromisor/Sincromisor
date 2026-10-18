package client

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"testing/synctest"

	"github.com/coder/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func synthesisCompletion(t *testing.T, requests *synthesisRequests, id int64) {
	t.Helper()
	first, err := protocol.DecodeSynthesizerChunk(fixture(t, "voice_synthesizer_chunk.msgpack"))
	if err != nil {
		t.Fatal(err)
	}
	first.RequestID = id
	payload, err := msgpack.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = requests.decode(payload); err != nil {
		t.Fatal(err)
	}
	final := protocol.SynthesizerChunk{RequestID: id, SpeechID: 42, Sequence: 1, SampleOffset: int64(len(first.PCM) / 2), Final: true, PCM: []byte{}, MoraQueue: []protocol.SynthesizerMora{}}
	payload, err = msgpack.Marshal(final)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = requests.decode(payload); err != nil {
		t.Fatal(err)
	}
}

func TestSynthesisRequestsWaitForCompletionWithoutConsumingCanceledID(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		requests := &synthesisRequests{}
		for range 8 {
			if err := requests.add(context.Background(), nil, 42); err != nil {
				t.Fatal(err)
			}
		}
		ctx, cancel := context.WithCancel(context.Background())
		result := make(chan error, 1)
		go func() { result <- requests.add(ctx, nil, 42) }()
		synctest.Wait()
		select {
		case err := <-result:
			t.Fatalf("full window returned %v", err)
		default:
		}
		cancel()
		if err := <-result; !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
		if requests.sent != 8 || len(requests.pending) != 8 {
			t.Fatal("canceled request consumed identity")
		}
		go func() { result <- requests.add(context.Background(), nil, 42) }()
		synctest.Wait()
		select {
		case err := <-result:
			t.Fatalf("full window returned %v", err)
		default:
		}
		synthesisCompletion(t, requests, 1)
		if err := <-result; err != nil {
			t.Fatal(err)
		}
		if requests.sent != 9 || len(requests.pending) != 8 {
			t.Fatal("completion did not release exactly one slot")
		}
		for id := int64(2); id <= 9; id++ {
			synthesisCompletion(t, requests, id)
		}
		if len(requests.pending) != 0 {
			t.Fatal("pending requests remain")
		}
	})
}

func TestSynthesisSendWaitersStopOnCancellationAndConnectionEnd(t *testing.T) {
	for _, closeConnection := range []bool{false, true} {
		name := "caller cancellation"
		if closeConnection {
			name = "connection end"
		}
		t.Run(name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				client, err := NewSynthesizer(testConfig("chat"), fakeResolver{}, testLogger())
				if err != nil {
					t.Fatal(err)
				}
				lifetime, closeLifetime := context.WithCancel(context.Background())
				defer closeLifetime()
				client.state = stateOpen
				client.lifetimeCtx = lifetime
				for range 8 {
					if err := client.requests.add(context.Background(), nil, 42); err != nil {
						t.Fatal(err)
					}
				}
				value := processorResultWithPadding(t, 0)
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				first := make(chan error, 1)
				second := make(chan error, 1)
				go func() { first <- client.SendResult(ctx, value) }()
				synctest.Wait()
				go func() { second <- client.SendResult(ctx, value) }()
				synctest.Wait()
				select {
				case err := <-first:
					t.Fatalf("slot wait returned %v", err)
				default:
				}
				select {
				case err := <-second:
					t.Fatalf("send-order wait returned %v", err)
				default:
				}
				want := context.Canceled
				if closeConnection {
					closeLifetime()
					want = ErrClosed
				} else {
					cancel()
				}
				for _, done := range []chan error{first, second} {
					if err := <-done; !errors.Is(err, want) {
						t.Fatalf("waiter=%v, want %v", err, want)
					}
				}
				if client.requests.sent != 8 || len(client.requests.pending) != 8 {
					t.Fatal("waiter consumed identity")
				}
			})
		})
	}
}

func TestSynthesisWebSocketCompletesMoreThanPendingWindow(t *testing.T) {
	const count = 16
	first, err := protocol.DecodeSynthesizerChunk(fixture(t, "voice_synthesizer_chunk.msgpack"))
	if err != nil {
		t.Fatal(err)
	}
	server, endpoint := websocketServer(t, func(ctx context.Context, conn *websocket.Conn, _ *http.Request) {
		read := func() bool {
			_, _, err := conn.Read(ctx)
			if err != nil {
				t.Errorf("read request: %v", err)
				return false
			}
			return true
		}
		for range 8 {
			if !read() {
				return
			}
		}
		for id := int64(1); id <= count; id++ {
			chunk := first
			chunk.RequestID = id
			final := protocol.SynthesizerChunk{RequestID: id, SpeechID: 42, Sequence: 1, SampleOffset: int64(len(first.PCM) / 2), Final: true, PCM: []byte{}, MoraQueue: []protocol.SynthesizerMora{}}
			for _, value := range []protocol.SynthesizerChunk{chunk, final} {
				payload, err := msgpack.Marshal(value)
				if err != nil {
					t.Error(err)
					return
				}
				if err = conn.Write(ctx, websocket.MessageBinary, payload); err != nil {
					t.Error(err)
					return
				}
			}
			if id <= count-8 {
				if !read() {
					return
				}
			}
		}
		waitForPeerClose(ctx, conn)
	})
	defer server.Close()
	client, err := NewSynthesizer(testConfig("chat"), fakeResolver{endpoint: endpoint}, testLogger())
	if err != nil {
		t.Fatal(err)
	}
	if err = client.Connect(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	sent := make(chan error, 1)
	value := processorResultWithPadding(t, 0)
	go func() {
		for range count {
			if err := client.SendResult(context.Background(), value); err != nil {
				sent <- err
				return
			}
		}
		sent <- nil
	}()
	for id := int64(1); id <= count; id++ {
		for _, final := range []bool{false, true} {
			chunk := receive(t, client.Results())
			if chunk.RequestID != id || chunk.Final != final {
				t.Fatalf("unexpected chunk: id=%d final=%v", chunk.RequestID, chunk.Final)
			}
		}
	}
	if err := receive(t, sent); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-client.Events():
		t.Fatalf("unexpected connection failure: %v", event)
	default:
	}
}
