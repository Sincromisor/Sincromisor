package pipeline

import (
	"errors"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// conversation は1世代で処理中の発話と要求を所有する。
// 完了済み発話は最後のspeechIDとの比較、完了済み要求はrequestsからの削除で再受理を防ぐ。
// 確定した会話履歴と世代をまたぐ抽出IDはCoordinatorが保持する。
type conversation struct {
	mu        sync.Mutex
	sessionID string
	speechID  int64
	sequence  int64
	open      bool

	outstanding map[int64]protocol.ExtractorResult
	requests    map[int64]protocol.ProcessorRequest
	currentUser *protocol.ChatMessage
}

// extractionIdentity は再接続後も同じ発話を再送しないための、セッション共通の最終受理IDである。
type extractionIdentity struct {
	seen       bool
	generation uint64
	speechID   int64
	sequenceID int64
}

// newConversation は世代内の照合状態を初期化する。再初期化時はこの値全体を交換する。
func newConversation(sessionID string) *conversation {
	return &conversation{
		sessionID: sessionID, speechID: -1, sequence: -1,
		outstanding: make(map[int64]protocol.ExtractorResult), requests: make(map[int64]protocol.ProcessorRequest),
	}
}

// acceptExtractionはgeneration-localな発話状態とsession-wide identityを同じCoordinator lock下で更新する。
//
// sequenceはsession全体でstrictly increasingである。generationが変わった最初のresultは、
// 旧generationのin-flight speechを新規発話として再送しないようspeech IDもstrictly largerを要求する。
func (c *Coordinator) acceptExtraction(
	generation uint64,
	conv *conversation,
	value protocol.ExtractorResult,
) (protocol.ExtractorResult, bool, error) {
	c.mu.Lock()
	if c.state != StateRunning || c.generation != generation {
		c.mu.Unlock()
		c.recordStaleDrop(pclient.ServiceExtractor)
		return protocol.ExtractorResult{}, false, nil
	}
	last := c.extraction
	if last.seen && (value.SequenceID <= last.sequenceID ||
		value.SpeechID < last.speechID ||
		(generation != last.generation && value.SpeechID <= last.speechID)) {
		c.mu.Unlock()
		return protocol.ExtractorResult{}, true, errors.New("extractor session identity did not increase")
	}
	combined, err := conv.acceptExtraction(value)
	if err == nil {
		c.extraction = extractionIdentity{
			seen: true, generation: generation,
			speechID: value.SpeechID, sequenceID: value.SequenceID,
		}
	}
	c.mu.Unlock()
	return combined, true, err
}

// acceptExtraction は発話IDと通番を検証し、認識結果との照合が済むまで入力を保持する。
// 発話途中では同じ発話だけを受け、確定後はより大きい発話IDだけを受ける。
func (c *conversation) acceptExtraction(value protocol.ExtractorResult) (protocol.ExtractorResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if value.SessionID != c.sessionID || value.SpeechID < 0 || value.SequenceID <= c.sequence {
		return protocol.ExtractorResult{}, errors.New("extractor result identity or sequence is invalid")
	}
	if c.open && value.SpeechID != c.speechID {
		return protocol.ExtractorResult{}, errors.New("extractor changed speech before confirmation")
	}
	if !c.open {
		// speech_idはsequence_idと独立して完了済み発話を識別する。最後に確定したIDを保持し、
		// 遅延した旧発話が新しいsequenceだけを理由に新規発話として受理されることを防ぐ。
		if value.SpeechID <= c.speechID {
			return protocol.ExtractorResult{}, errors.New("extractor speech ID did not increase")
		}
		c.open, c.speechID = true, value.SpeechID
	}
	c.sequence = value.SequenceID
	// Extractorの各partialは未送信の差分音声である。Recognizerも同じ単位で処理するため、
	// ここで過去のpartialを結合すると同じframeを複数回認識へ渡してしまう。
	c.outstanding[value.SequenceID] = value
	if value.Confirmed {
		c.open = false
	}
	return value, nil
}

// acceptRecognition は送信済み入力と一致する結果だけを一度受理し、照合用の入力を解放する。
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

// recognitionMessageはpartial間でChatMessage identityを維持し、confirmedでだけcurrent userを閉じる。
// これによりFrontendは同じmessageを更新でき、reset時は未確定messageがhistoryへ残らない。
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

// rememberRequest は単調増加する認識通番で要求を保持し、文章処理の応答との照合に備える。
func (c *conversation) rememberRequest(request protocol.ProcessorRequest) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.requests[request.SequenceID] = request
}

// validateProcessor は要求の同一性と履歴の更新を検証し、最終応答でだけ要求を解放する。
// 解放後の同じ通番への応答は、途中応答も最終応答も要求不在として拒否する。
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
	if !value.EndOfResponse {
		// Intermediate resultは表示/TTS増分だけを運び、processorがrequest前historyを
		// 先行変更することを許さない。history commitは下のfinal branchだけが行う。
		if !reflect.DeepEqual(value.History, request.History) {
			return protocol.ProcessorRequest{}, false, errors.New("intermediate processor history differs")
		}
		return request, false, nil
	}
	// Final resultはrequest historyをprefixとしてresponseを1件だけ追加した完全形である。
	// この検証後だけCoordinatorがconfirmed historyとして採用できる。
	if len(value.History.Messages) != len(request.History.Messages)+1 ||
		!reflect.DeepEqual(value.History.Messages[:len(request.History.Messages)], request.History.Messages) ||
		!reflect.DeepEqual(value.History.Messages[len(value.History.Messages)-1], value.ResponseMessage) ||
		value.ResponseMessage.SpeechID != request.RequestMessage.SpeechID {
		return protocol.ProcessorRequest{}, false, errors.New("final processor history is inconsistent")
	}
	delete(c.requests, value.SequenceID)
	return request, true, nil
}

func cloneMessages(values []protocol.ChatMessage) []protocol.ChatMessage {
	// Processor wire contractは履歴なしをnon-nilの空listで表すため、nil入力もここで正規化する。
	return append(make([]protocol.ChatMessage, 0, len(values)), values...)
}
