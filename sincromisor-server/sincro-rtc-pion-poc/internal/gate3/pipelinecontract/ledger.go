package pipelinecontract

import (
	"fmt"

	"github.com/vmihailenco/msgpack/v5"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

type identity struct {
	sessionID string
	speechID  int64
}

func (s *Set) processorResponse(request map[string]any) ([]byte, int, error) {
	response, err := decodeMap(s.fixtures["text_processor_result.msgpack"])
	if err != nil {
		return nil, 0, err
	}
	history := request["history"].(map[string]any)
	messages := history["messages"].([]any)
	requestMessage := request["request_message"].(map[string]any)
	responseMessage, ok := response["response_message"].(map[string]any)
	if !ok {
		return nil, 0, fmt.Errorf("%w: processor response fixture", ErrProtocol)
	}
	responseMessage["speech_id"] = requestMessage["speech_id"]
	response["session_id"] = request["session_id"]
	response["sequence_id"] = request["sequence_id"]
	response["confirmed"] = request["confirmed"]
	response["request_message"] = requestMessage
	response["history"] = map[string]any{"messages": append(append([]any(nil), messages...), responseMessage)}
	response["end_of_response"] = true
	response["voice_text"] = "固定された応答文"
	payload, marshalErr := msgpack.Marshal(response)
	return payload, len(messages) + 1, marshalErr
}

// expectIdentity は1 extractor sequence の次の service 位置と identity を照合する。
// proxy 障害 attempt も service が生成済みの prefix を台帳へ残し、後続 generation は
// 新しい sequence で Extractor から再開する。
func (s *Set) expectIdentity(sessionID string, speechID, sequenceID int64, expected int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	identity, found := s.identityBySequence[sequenceID]
	return found && identity.sessionID == sessionID && identity.speechID == speechID &&
		s.stageBySequence[sequenceID] == expected
}

func (s *Set) appendStage(
	service discovery.Service,
	sessionID string,
	speechID, sequenceID int64,
	historyLength, finalHistorySize int,
	byteIdentical bool,
) {
	s.mu.Lock()
	defer s.mu.Unlock()
	expected := s.stageBySequence[sequenceID]
	serviceIndex := 0
	for index, candidate := range serviceOrder {
		if candidate == service {
			serviceIndex = index
			break
		}
	}
	if expected != serviceIndex {
		s.errs = append(s.errs, fmt.Errorf(
			"%w: sequence %d reached %s at stage %d, want %d",
			ErrProtocol, sequenceID, service, serviceIndex, expected,
		))
		return
	}
	if service == discovery.ServiceExtractor {
		if _, exists := s.identityBySequence[sequenceID]; exists {
			s.errs = append(s.errs, fmt.Errorf("%w: duplicate extractor sequence %d", ErrIdentity, sequenceID))
			return
		}
		s.identityBySequence[sequenceID] = identity{sessionID: sessionID, speechID: speechID}
	}
	s.stageBySequence[sequenceID]++
	s.entries = append(s.entries, Entry{
		Ordinal: len(s.entries) + 1, Service: service, SessionID: sessionID,
		SpeechID: speechID, SequenceID: sequenceID, HistoryLength: historyLength,
		FinalHistorySize: finalHistorySize, ByteIdentical: byteIdentical,
	})
}
