package pipelinecontract

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"net/http"

	"github.com/coder/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

const (
	speechPeakThreshold = 512
	speechQuietFrames   = 5
)

type speechBoundary struct {
	inSpeech    bool
	quietFrames int
}

// Observe は固定入力の s16le PCM を振幅で区分し、5 frame連続でquietになった境界だけを返す。
// 512/5はOpus経路の微小値と一時quietを除き、固定WAVの約19 frameの中間無音を分けるfixture値である。
func (b *speechBoundary) Observe(frame []byte) bool {
	hasSpeech := framePeak(frame) > speechPeakThreshold
	if hasSpeech {
		b.inSpeech = true
		b.quietFrames = 0
		return false
	}
	if !b.inSpeech {
		return false
	}
	b.quietFrames++
	if b.quietFrames < speechQuietFrames {
		return false
	}
	b.inSpeech = false
	b.quietFrames = 0
	return true
}

func framePeak(frame []byte) int {
	peak := 0
	for offset := 0; offset+1 < len(frame); offset += 2 {
		sample := int(int16(binary.LittleEndian.Uint16(frame[offset : offset+2])))
		if sample < 0 {
			sample = -sample
		}
		if sample > peak {
			peak = sample
		}
	}
	return peak
}

func (s *Set) serve(service discovery.Service, response http.ResponseWriter, request *http.Request) {
	conn, err := websocket.Accept(response, request, nil)
	if err != nil {
		s.record(fmt.Errorf("%w: accept %s: %v", ErrProtocol, service, err))
		return
	}
	defer conn.CloseNow()
	ctx, cancel := context.WithCancel(s.ctx)
	defer cancel()
	switch service {
	case discovery.ServiceExtractor:
		s.serveExtractor(ctx, conn)
	case discovery.ServiceRecognizer:
		s.serveRecognizer(ctx, conn)
	case discovery.ServiceProcessor:
		s.serveProcessor(ctx, conn)
	case discovery.ServiceSynthesizer:
		s.serveSynthesizer(ctx, conn)
	}
}

// Extractor は接続 preface を先に固定 schema で検査し、以後の確定発話ごとに
// fixture の基準 ID を単調増加させる。台帳確定後に response を送るため、proxy が破棄した
// held response も障害 prefix として観測できる。
func (s *Set) serveExtractor(ctx context.Context, conn *websocket.Conn) {
	_, initialize, err := conn.Read(ctx)
	if err != nil {
		return
	}
	decoded, err := decodeMap(initialize)
	if err != nil || !validateShape(decoded, s.schema["extractor_initialize.msgpack"]) {
		s.record(fmt.Errorf("%w: extractor initialize schema", ErrProtocol))
		return
	}
	sessionID, ok := decoded["session_id"].(string)
	if !ok || sessionID == "" {
		s.record(fmt.Errorf("%w: extractor session ID", ErrIdentity))
		return
	}
	boundary := speechBoundary{}
	for {
		messageType, frame, readErr := conn.Read(ctx)
		if readErr != nil {
			return
		}
		if messageType != websocket.MessageBinary {
			s.record(fmt.Errorf("%w: extractor PCM must be binary", ErrProtocol))
			return
		}
		s.recordPCM(framePeak(frame))
		if !boundary.Observe(frame) {
			continue
		}
		attempt, accepted := s.reserveSpeechResult()
		if !accepted {
			continue
		}
		s.mu.Lock()
		speechID := s.baseSpeechID + attempt
		sequenceID := s.baseSequenceID + attempt
		s.mu.Unlock()
		result, patchErr := s.patchedIdentity(
			"extractor_result.msgpack", sessionID, speechID, sequenceID,
		)
		if patchErr != nil {
			s.record(patchErr)
			return
		}
		s.appendStage(discovery.ServiceExtractor, sessionID, speechID, sequenceID, 0, 0, false)
		if err := conn.Write(ctx, websocket.MessageBinary, result); err != nil {
			return
		}
	}
}

// Recognizer は直前の Extractor identity と wire schema を照合し、同じ identity だけを
// fixture response へ移して Processor 前段を確定する。
func (s *Set) serveRecognizer(ctx context.Context, conn *websocket.Conn) {
	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			return
		}
		value, decodeErr := decodeMap(payload)
		if decodeErr != nil || !validateShape(value, s.schema["extractor_result.msgpack"]) {
			s.record(fmt.Errorf("%w: recognizer request schema", ErrProtocol))
			return
		}
		sessionID, _ := value["session_id"].(string)
		speechID, speechOK := int64Field(value, "speech_id")
		sequenceID, sequenceOK := int64Field(value, "sequence_id")
		if !speechOK || !sequenceOK {
			s.record(fmt.Errorf("%w: recognizer request identity", ErrIdentity))
			return
		}
		if err := s.validateIdentity(sessionID, speechID, sequenceID, 1); err != nil {
			s.record(err)
			return
		}
		response, patchErr := s.patchedIdentity(
			"recognizer_result.msgpack", sessionID, speechID, sequenceID,
		)
		if patchErr != nil {
			s.record(patchErr)
			return
		}
		s.appendStage(discovery.ServiceRecognizer, sessionID, speechID, sequenceID, 0, 0, false)
		if err := conn.Write(ctx, websocket.MessageBinary, response); err != nil {
			return
		}
	}
}

// Processor は確定済み履歴を含む request schema と上流 identity を照合し、
// fixture response に session 所有値を反映する。生成 bytes は後段の同一性検査まで台帳が所有する。
func (s *Set) serveProcessor(ctx context.Context, conn *websocket.Conn) {
	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			return
		}
		request, decodeErr := decodeMap(payload)
		if decodeErr != nil || !validateShape(request, s.schema["text_processor_request.msgpack"]) {
			s.record(fmt.Errorf("%w: processor request schema", ErrProtocol))
			return
		}
		sessionID, _ := request["session_id"].(string)
		sequenceID, sequenceOK := int64Field(request, "sequence_id")
		requestMessage, _ := request["request_message"].(map[string]any)
		speechID, speechOK := int64Field(requestMessage, "speech_id")
		history, _ := request["history"].(map[string]any)
		messages, historyOK := history["messages"].([]any)
		if !sequenceOK || !speechOK {
			s.record(fmt.Errorf("%w: processor request identity", ErrIdentity))
			return
		}
		if !historyOK {
			s.record(fmt.Errorf("%w: processor request history", ErrProtocol))
			return
		}
		if err := s.validateIdentity(sessionID, speechID, sequenceID, 2); err != nil {
			s.record(err)
			return
		}
		response, finalSize, patchErr := s.processorResponse(request)
		if patchErr != nil {
			s.record(patchErr)
			return
		}
		s.mu.Lock()
		s.processorPayload[sequenceID] = bytes.Clone(response)
		s.processorSession[sequenceID] = sessionID
		s.processorHistory[sequenceID] = len(messages)
		s.processorFinalSize[sequenceID] = finalSize
		s.mu.Unlock()
		s.appendStage(discovery.ServiceProcessor, sessionID, speechID, sequenceID, len(messages), finalSize, false)
		if err := conn.Write(ctx, websocket.MessageBinary, response); err != nil {
			return
		}
	}
}

// Synthesizer は Processor が保存した bytes との完全一致を先に確認し、再 encode されていない
// request だけへ fixture 音声を返す。
func (s *Set) serveSynthesizer(ctx context.Context, conn *websocket.Conn) {
	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			return
		}
		request, decodeErr := decodeMap(payload)
		if decodeErr != nil {
			s.record(fmt.Errorf("%w: synthesizer request schema", ErrProtocol))
			return
		}
		sessionID, _ := request["session_id"].(string)
		sequenceID, sequenceOK := int64Field(request, "sequence_id")
		requestMessage, _ := request["request_message"].(map[string]any)
		speechID, speechOK := int64Field(requestMessage, "speech_id")
		s.mu.Lock()
		expected := s.processorPayload[sequenceID]
		history := s.processorHistory[sequenceID]
		finalSize := s.processorFinalSize[sequenceID]
		expectedSession := s.processorSession[sequenceID]
		s.mu.Unlock()
		identical := bytes.Equal(payload, expected)
		if !sequenceOK || !speechOK || expectedSession != sessionID || !identical {
			s.record(fmt.Errorf("%w: synthesizer request identity or processor bytes", ErrIdentity))
			return
		}
		if err := s.validateIdentity(sessionID, speechID, sequenceID, 3); err != nil {
			s.record(err)
			return
		}
		response, patchErr := patchSynthesizerResult(
			s.fixtures["voice_synthesizer_result.msgpack"], speechID,
		)
		if patchErr != nil {
			s.record(patchErr)
			return
		}
		s.appendStage(discovery.ServiceSynthesizer, sessionID, speechID, sequenceID, history, finalSize, true)
		if err := conn.Write(ctx, websocket.MessageBinary, response); err != nil {
			return
		}
	}
}

func (s *Set) patchedIdentity(name, sessionID string, speechID, sequenceID int64) ([]byte, error) {
	value, err := decodeMap(s.fixtures[name])
	if err != nil {
		return nil, err
	}
	value["session_id"], value["speech_id"], value["sequence_id"] = sessionID, speechID, sequenceID
	return msgpack.Marshal(value)
}

func patchSynthesizerResult(payload []byte, speechID int64) ([]byte, error) {
	value, err := decodeMap(payload)
	if err != nil {
		return nil, err
	}
	value["speech_id"] = speechID
	// protocol fixtureのvoiceはschema確認用の不正Oggなので、ブラウザーまで通す契約serviceは
	// FFmpegでdecodeできる有限の非無音WAVへ差し替える。schema自体はcommit済みfixtureで検査済みである。
	value["voice"] = synthesizedWAV()
	value["audio_format"] = "audio/wav"
	return msgpack.Marshal(value)
}
