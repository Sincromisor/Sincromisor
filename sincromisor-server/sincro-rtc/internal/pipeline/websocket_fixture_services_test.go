package pipeline

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/coder/websocket"
	"github.com/vmihailenco/msgpack/v5"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

type fixtureWebSocketHarness struct {
	t        *testing.T
	states   map[pclient.Service]*fixtureServiceState
	resolver *fixtureResolver
	fixtures map[string][]byte

	mu                 sync.Mutex
	processorHistories []int
	processorPayload   []byte
	extractorIDs       []testExtractionIdentity
	synthRequests      int
	errs               []error
}

type fixtureServiceState struct {
	server   *httptest.Server
	mu       sync.Mutex
	conns    map[*websocket.Conn]struct{}
	accepted atomic.Int64
	active   atomic.Int64
}

func newFixtureWebSocketHarness(t *testing.T) *fixtureWebSocketHarness {
	t.Helper()
	harness := &fixtureWebSocketHarness{
		t:        t,
		states:   map[pclient.Service]*fixtureServiceState{},
		fixtures: map[string][]byte{},
	}
	for _, name := range []string{
		"extractor_initialize.msgpack",
		"extractor_result.msgpack",
		"recognizer_result.msgpack",
		"text_processor_request.msgpack",
		"text_processor_result.msgpack",
		"voice_synthesizer_result.msgpack",
	} {
		payload, err := os.ReadFile("protocol/testdata/" + name)
		if err != nil {
			t.Fatalf("read Python fixture %s: %v", name, err)
		}
		harness.fixtures[name] = payload
	}
	for _, service := range []pclient.Service{
		pclient.ServiceExtractor,
		pclient.ServiceRecognizer,
		pclient.ServiceProcessor,
		pclient.ServiceSynthesizer,
	} {
		state := &fixtureServiceState{conns: make(map[*websocket.Conn]struct{})}
		state.server = httptest.NewServer(http.HandlerFunc(func(
			response http.ResponseWriter,
			request *http.Request,
		) {
			harness.serve(service, state, response, request)
		}))
		harness.states[service] = state
	}
	harness.resolver = newFixtureResolver(t, harness.states)
	return harness
}

func (h *fixtureWebSocketHarness) serve(
	service pclient.Service,
	state *fixtureServiceState,
	response http.ResponseWriter,
	request *http.Request,
) {
	conn, err := websocket.Accept(response, request, nil)
	if err != nil {
		h.recordError(err)
		return
	}
	state.mu.Lock()
	state.conns[conn] = struct{}{}
	state.mu.Unlock()
	state.accepted.Add(1)
	state.active.Add(1)
	defer func() {
		_ = conn.CloseNow()
		state.mu.Lock()
		delete(state.conns, conn)
		state.mu.Unlock()
		state.active.Add(-1)
	}()

	ctx := request.Context()
	switch service {
	case pclient.ServiceExtractor:
		h.serveExtractor(ctx, conn)
	case pclient.ServiceRecognizer:
		h.serveRecognizer(ctx, conn)
	case pclient.ServiceProcessor:
		h.serveProcessor(ctx, conn)
	case pclient.ServiceSynthesizer:
		h.serveSynthesizer(ctx, conn)
	}
}

func (h *fixtureWebSocketHarness) serveExtractor(ctx context.Context, conn *websocket.Conn) {
	_, initialize, err := conn.Read(ctx)
	if err != nil {
		return
	}
	if !sameMessagePackKeys(initialize, h.fixtures["extractor_initialize.msgpack"]) {
		h.recordError(errors.New("extractor initialize does not match Python fixture schema"))
		return
	}
	for {
		_, _, err = conn.Read(ctx)
		if err != nil {
			return
		}
		fixture, decodeErr := protocol.DecodeExtractorResult(h.fixtures["extractor_result.msgpack"])
		if decodeErr != nil {
			h.recordError(decodeErr)
			return
		}
		h.mu.Lock()
		turn := int64(len(h.extractorIDs))
		identity := testExtractionIdentity{
			speechID: fixture.SpeechID + turn, sequenceID: fixture.SequenceID + turn,
		}
		h.extractorIDs = append(h.extractorIDs, identity)
		h.mu.Unlock()
		payload, patchErr := patchFixtureIdentity(
			h.fixtures["extractor_result.msgpack"],
			identity.speechID,
			identity.sequenceID,
		)
		if patchErr != nil {
			h.recordError(patchErr)
			return
		}
		if err = conn.Write(ctx, websocket.MessageBinary, payload); err != nil {
			return
		}
	}
}

func (h *fixtureWebSocketHarness) serveRecognizer(ctx context.Context, conn *websocket.Conn) {
	fixture, err := protocol.DecodeExtractorResult(h.fixtures["extractor_result.msgpack"])
	if err != nil {
		h.recordError(err)
		return
	}
	for {
		_, payload, readErr := conn.Read(ctx)
		if readErr != nil {
			return
		}
		value, decodeErr := protocol.DecodeExtractorResult(payload)
		if decodeErr == nil {
			fixture.SpeechID, fixture.SequenceID = value.SpeechID, value.SequenceID
		}
		if decodeErr != nil || !reflect.DeepEqual(value, fixture) {
			h.recordError(errors.New("recognizer input differs from Python extractor fixture"))
			return
		}
		response, patchErr := patchFixtureIdentity(
			h.fixtures["recognizer_result.msgpack"],
			value.SpeechID,
			value.SequenceID,
		)
		if patchErr != nil {
			h.recordError(patchErr)
			return
		}
		if err = conn.Write(ctx, websocket.MessageBinary, response); err != nil {
			return
		}
	}
}

// patchFixtureIdentity はPython生成済みfield値とschemaを保ち、後続発話の再現に必要な
// session所有IDだけを差し替える。
func patchFixtureIdentity(payload []byte, speechID, sequenceID int64) ([]byte, error) {
	var value map[string]any
	if err := msgpack.Unmarshal(payload, &value); err != nil {
		return nil, err
	}
	value["speech_id"] = speechID
	value["sequence_id"] = sequenceID
	return msgpack.Marshal(value)
}

func (h *fixtureWebSocketHarness) serveProcessor(ctx context.Context, conn *websocket.Conn) {
	for {
		_, requestPayload, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if !sameMessagePackKeys(requestPayload, h.fixtures["text_processor_request.msgpack"]) {
			h.recordError(errors.New("processor request does not match Python fixture schema"))
			return
		}
		responsePayload, historyLength, patchErr := h.processorResponse(requestPayload)
		if patchErr != nil {
			h.recordError(patchErr)
			return
		}
		h.mu.Lock()
		h.processorHistories = append(h.processorHistories, historyLength)
		h.processorPayload = append([]byte(nil), responsePayload...)
		h.mu.Unlock()
		if err = conn.Write(ctx, websocket.MessageBinary, responsePayload); err != nil {
			return
		}
	}
}

func (h *fixtureWebSocketHarness) processorResponse(requestPayload []byte) ([]byte, int, error) {
	var request map[string]any
	if err := msgpack.Unmarshal(requestPayload, &request); err != nil {
		return nil, 0, err
	}
	var response map[string]any
	if err := msgpack.Unmarshal(h.fixtures["text_processor_result.msgpack"], &response); err != nil {
		return nil, 0, err
	}
	requestHistory, ok := request["history"].(map[string]any)
	if !ok {
		return nil, 0, errors.New("processor request history is not a map")
	}
	messages, ok := requestHistory["messages"].([]any)
	if !ok {
		return nil, 0, errors.New("processor request history messages is not a list")
	}
	responseMessage, ok := response["response_message"].(map[string]any)
	if !ok {
		return nil, 0, errors.New("processor fixture response message is not a map")
	}
	requestMessage, ok := request["request_message"].(map[string]any)
	if !ok {
		return nil, 0, errors.New("processor request message is not a map")
	}
	responseMessage["speech_id"] = requestMessage["speech_id"]
	response["session_id"] = request["session_id"]
	response["sequence_id"] = request["sequence_id"]
	response["confirmed"] = request["confirmed"]
	response["request_message"] = requestMessage
	response["history"] = map[string]any{"messages": append(append([]any(nil), messages...), responseMessage)}
	response["end_of_response"] = true
	response["voice_text"] = "固定された応答文"
	payload, err := msgpack.Marshal(response)
	return payload, len(messages), err
}

func (h *fixtureWebSocketHarness) serveSynthesizer(ctx context.Context, conn *websocket.Conn) {
	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			return
		}
		h.mu.Lock()
		expected := append([]byte(nil), h.processorPayload...)
		if !bytes.Equal(payload, expected) {
			h.errs = append(h.errs, errors.New("synthesizer did not receive raw processor fixture bytes"))
			h.mu.Unlock()
			return
		}
		h.synthRequests++
		h.mu.Unlock()
		if err = conn.Write(ctx, websocket.MessageBinary, h.fixtures["voice_synthesizer_result.msgpack"]); err != nil {
			return
		}
	}
}

func sameMessagePackKeys(actual, fixture []byte) bool {
	var actualMap, fixtureMap map[string]any
	if msgpack.Unmarshal(actual, &actualMap) != nil || msgpack.Unmarshal(fixture, &fixtureMap) != nil {
		return false
	}
	if len(actualMap) != len(fixtureMap) {
		return false
	}
	for key := range fixtureMap {
		if _, found := actualMap[key]; !found {
			return false
		}
	}
	return true
}
