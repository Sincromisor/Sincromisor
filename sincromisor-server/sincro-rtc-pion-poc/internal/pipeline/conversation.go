package pipeline

import (
	"errors"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

type conversation struct {
	mu        sync.Mutex
	sessionID string
	speechID  int64
	sequence  int64
	open      bool
	closed    map[int64]struct{}

	accumulated map[int64]protocol.ExtractorResult
	outstanding map[int64]protocol.ExtractorResult
	requests    map[int64]protocol.ProcessorRequest
	finalized   map[int64]struct{}
	currentUser *protocol.ChatMessage
}

func newConversation(sessionID string) *conversation {
	return &conversation{
		sessionID: sessionID, speechID: -1, sequence: -1,
		closed: make(map[int64]struct{}), accumulated: make(map[int64]protocol.ExtractorResult),
		outstanding: make(map[int64]protocol.ExtractorResult), requests: make(map[int64]protocol.ProcessorRequest),
		finalized: make(map[int64]struct{}),
	}
}

func (c *conversation) acceptExtraction(value protocol.ExtractorResult) (protocol.ExtractorResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if value.SessionID != c.sessionID || value.SpeechID < 0 || value.SequenceID <= c.sequence {
		return protocol.ExtractorResult{}, errors.New("extractor result identity or sequence is invalid")
	}
	if _, found := c.closed[value.SpeechID]; found {
		return protocol.ExtractorResult{}, errors.New("extractor result targets a confirmed speech")
	}
	if c.open && value.SpeechID != c.speechID {
		return protocol.ExtractorResult{}, errors.New("extractor changed speech before confirmation")
	}
	if !c.open {
		c.open, c.speechID = true, value.SpeechID
	}
	c.sequence = value.SequenceID
	if previous, found := c.accumulated[value.SpeechID]; found {
		voice := make([]byte, 0, len(previous.Voice)+len(value.Voice))
		voice = append(voice, previous.Voice...)
		voice = append(voice, value.Voice...)
		value.Voice = voice
	}
	c.accumulated[value.SpeechID] = value
	c.outstanding[value.SequenceID] = value
	if value.Confirmed {
		c.open = false
		c.closed[value.SpeechID] = struct{}{}
		delete(c.accumulated, value.SpeechID)
	}
	return value, nil
}

func (c *conversation) acceptRecognition(value protocol.RecognizerResult) (protocol.ExtractorResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	extraction, found := c.outstanding[value.SequenceID]
	if !found || extraction.SessionID != value.SessionID || extraction.SpeechID != value.SpeechID ||
		extraction.SequenceID != value.SequenceID || extraction.Confirmed != value.Confirmed {
		return protocol.ExtractorResult{}, errors.New("recognizer result has no matching extraction")
	}
	delete(c.outstanding, value.SequenceID)
	return extraction, nil
}

func (c *conversation) recognitionMessage(value protocol.RecognizerResult) protocol.ChatMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	var text strings.Builder
	for _, token := range value.Result {
		text.WriteString(token.Text)
	}
	if c.currentUser == nil {
		c.currentUser = &protocol.ChatMessage{
			SpeechID: value.SpeechID, MessageID: ulid.Make().String(), MessageType: "user",
			SpeakerID: "user", SpeakerName: "User",
			CreatedAt: float64(time.Now().UnixNano()) / float64(time.Second),
		}
	}
	if c.currentUser.SpeechID != value.SpeechID {
		return protocol.ChatMessage{}
	}
	c.currentUser.Message = text.String()
	result := *c.currentUser
	if value.Confirmed {
		c.currentUser = nil
	}
	return result
}

func (c *conversation) rememberRequest(request protocol.ProcessorRequest) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.requests[request.SequenceID] = request
}

func (c *conversation) validateProcessor(value protocol.ProcessorResult) (protocol.ProcessorRequest, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	request, found := c.requests[value.SequenceID]
	if !found {
		return protocol.ProcessorRequest{}, false, errors.New("processor result has no matching request")
	}
	if value.SessionID != request.SessionID || value.Confirmed != request.Confirmed ||
		!reflect.DeepEqual(value.RequestMessage, request.RequestMessage) {
		return protocol.ProcessorRequest{}, false, errors.New("processor result request identity differs")
	}
	if _, done := c.finalized[value.SequenceID]; done {
		return protocol.ProcessorRequest{}, false, errors.New("processor result arrived after final")
	}
	if !value.EndOfResponse {
		if !reflect.DeepEqual(value.History, request.History) {
			return protocol.ProcessorRequest{}, false, errors.New("intermediate processor history differs")
		}
		return request, false, nil
	}
	if len(value.History.Messages) != len(request.History.Messages)+1 ||
		!reflect.DeepEqual(value.History.Messages[:len(request.History.Messages)], request.History.Messages) ||
		!reflect.DeepEqual(value.History.Messages[len(value.History.Messages)-1], value.ResponseMessage) ||
		value.ResponseMessage.SpeechID != request.RequestMessage.SpeechID {
		return protocol.ProcessorRequest{}, false, errors.New("final processor history is inconsistent")
	}
	c.finalized[value.SequenceID] = struct{}{}
	delete(c.requests, value.SequenceID)
	return request, true, nil
}

func cloneMessages(values []protocol.ChatMessage) []protocol.ChatMessage {
	return append([]protocol.ChatMessage(nil), values...)
}
