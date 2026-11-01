package pipeline

import (
	"errors"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// 世代内pipelineの処理順は、ブラウザーPCM、抽出、認識、文章処理、合成音声出力である。
// 各ループは1世代のcontextに属し、処理中の項目を同じ段階では再試行しない。
func (c *Coordinator) pcmLoop(work *generationWork, extractor ExtractorClient) {
	for {
		frame, ok := work.input.pop(work.ctx)
		if !ok {
			return
		}
		if err := extractor.SendPCM(work.ctx, frame); err != nil {
			c.runtimeFailure(work, pclient.ServiceExtractor, "send_pcm", "write_failed")
			return
		}
	}
}

// extractorLoop は全抽出入力を順序検証して世代の保留へ渡す。認識への送信待ちは
// recognitionSendLoopが所有するため、ここでは次の差分も受信して未送信分を結合できる。
func (c *Coordinator) extractorLoop(work *generationWork, extractor ExtractorClient) {
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-extractor.Results():
			if !ok {
				return
			}
			_, current, err := c.acceptExtraction(work.number, work.conv, value)
			if !current {
				continue
			}
			if err != nil {
				c.runtimeFailure(work, pclient.ServiceExtractor, "validate_extraction", "invalid_data", "speech_id", value.SpeechID, "sequence_id", value.SequenceID)
				return
			}
		}
	}
}

// recognizerLoop は実送信要求だけを照合し、受理で次の送信を起こしてから表示を更新する。
// 確定結果だけを履歴と文章処理へ渡し、暫定は同じメッセージの更新に使う。
func (c *Coordinator) recognizerLoop(work *generationWork, recognizer RecognizerClient, processor ProcessorClient) {
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-recognizer.Results():
			if !ok {
				return
			}
			if !c.isCurrentGeneration(work.number, pclient.ServiceRecognizer) {
				continue
			}
			if _, err := work.conv.acceptRecognition(value); err != nil {
				c.runtimeFailure(work, pclient.ServiceRecognizer, "validate_recognition", "invalid_data", "speech_id", value.SpeechID)
				return
			}
			// 段階ログは照合用IDと完了状態だけを保持する。認識、会話、音声の内容を
			// 運用ログへ入れてはならない。
			c.logger.Info("pipeline stage reached",
				"stage", "recognizer_result_received", "session_id", value.SessionID,
				"speech_id", value.SpeechID, "confirmed", value.Confirmed)
			message := work.conv.recognitionMessage(value)
			if message.MessageID == "" {
				c.runtimeFailure(work, pclient.ServiceRecognizer, "recognition_message", "invalid_data", "speech_id", value.SpeechID)
				return
			}
			if err := c.publishText(work.number, pclient.ServiceRecognizer, message); err != nil {
				c.runtimeFailure(work, pclient.ServiceRecognizer, "publish_text", "backpressure_timeout", "speech_id", value.SpeechID)
				return
			}
			// 暫定認識は表示だけを更新する。文章処理は確定にしか応答しないため、
			// 履歴の複製・転送や、解放契機のない照合用要求を作らない。
			if !value.Confirmed {
				continue
			}
			c.mu.Lock()
			c.history = append(c.history, message)
			history := cloneMessages(c.history)
			c.mu.Unlock()
			request := protocol.ProcessorRequest{
				SessionID: value.SessionID, SequenceID: value.SequenceID, Confirmed: value.Confirmed,
				History: protocol.ChatHistory{Messages: history}, RequestMessage: message,
			}
			work.conv.rememberRequest(request)
			if err := processor.SendRequest(work.ctx, request); err != nil {
				c.runtimeFailure(work, pclient.ServiceProcessor, "send_request", "write_failed", "speech_id", value.SpeechID)
				return
			}
			c.logger.Info("pipeline stage reached",
				"stage", "processor_request_sent", "session_id", request.SessionID,
				"sequence_id", request.SequenceID, "confirmed", request.Confirmed)
		}
	}
}

func (c *Coordinator) processorLoop(work *generationWork, processor ProcessorClient, synth SynthesizerClient) {
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-processor.Results():
			if !ok {
				return
			}
			if !c.isCurrentGeneration(work.number, pclient.ServiceProcessor) {
				continue
			}
			_, final, err := work.conv.validateProcessor(value)
			if err != nil {
				c.runtimeFailure(work, pclient.ServiceProcessor, "validate_processor", "invalid_data", "speech_id", value.ResponseMessage.SpeechID)
				return
			}
			c.logger.Info("pipeline stage reached",
				"stage", "processor_result_received", "session_id", value.SessionID,
				"sequence_id", value.SequenceID, "confirmed", value.Confirmed,
				"end_of_response", value.EndOfResponse,
				"voice_text_present", value.VoiceText != nil && *value.VoiceText != "")
			if err = c.publishText(work.number, pclient.ServiceProcessor, value.ResponseMessage); err != nil {
				c.runtimeFailure(work, pclient.ServiceProcessor, "publish_text", "backpressure_timeout", "speech_id", value.ResponseMessage.SpeechID)
				return
			}
			if final {
				c.mu.Lock()
				c.history = cloneMessages(value.History.Messages)
				c.mu.Unlock()
			}
			if value.VoiceText != nil && *value.VoiceText != "" {
				if err = synth.SendResult(work.ctx, value); err != nil {
					c.runtimeFailure(work, pclient.ServiceSynthesizer, "send_synthesis", "write_failed", "speech_id", value.ResponseMessage.SpeechID)
					return
				}
				work.synthesisSent++
			}
		}
	}
}

func (c *Coordinator) synthLoop(work *generationWork, synth SynthesizerClient) {
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-synth.Results():
			if !ok {
				return
			}
			if !c.isCurrentGeneration(work.number, pclient.ServiceSynthesizer) {
				continue
			}
			if value.Final {
				c.acceptSynthesisResult(work)
			}
			c.logger.Info("pipeline stage reached",
				"stage", "synthesizer_result_received", "session_id", c.sessionID,
				"speech_id", value.SpeechID, "confirmed", value.Final, "request_id", value.RequestID, "chunk_sequence", value.Sequence)
			if err := c.publishSynth(work.number, value); err != nil {
				c.runtimeFailure(work, pclient.ServiceSynthesizer, "publish_audio", "backpressure_timeout", "speech_id", value.SpeechID)
				return
			}
		}
	}
}

// acceptSynthesisResult は世代判定と受理件数を同じ境界で確定し、遅着を別に数える。
func (c *Coordinator) acceptSynthesisResult(work *generationWork) bool {
	c.mu.Lock()
	current := c.state == StateRunning && c.generation == work.number
	if current {
		work.synthesisReceived++
	}
	c.mu.Unlock()
	if !current {
		c.recordStaleDrop(pclient.ServiceSynthesizer)
	}
	return current
}

func (c *Coordinator) publishText(
	generation uint64,
	service pclient.Service,
	value protocol.ChatMessage,
) error {
	return publish(c, generation, service, c.textOut, Output[protocol.ChatMessage]{Generation: generation, Value: value})
}

func (c *Coordinator) publishSynth(generation uint64, value protocol.SynthesizerChunk) error {
	return publish(c, generation, pclient.ServiceSynthesizer, c.synthOut,
		Output[protocol.SynthesizerChunk]{Generation: generation, Value: value})
}

// publishと再初期化はoutputMuを外部向けの世代境界として共有する。生成側は境界内で状態を再確認し、
// 再初期化側は境界を解放する前に世代を進めて旧envelopeを除去する。
func publish[T any](
	c *Coordinator,
	generation uint64,
	service pclient.Service,
	target chan Output[T],
	value Output[T],
) error {
	c.outputMu.Lock()
	defer c.outputMu.Unlock()
	c.mu.Lock()
	current, running := c.generation, c.state == StateRunning
	ctx := c.sessionCtx
	c.mu.Unlock()
	if !running || current != generation {
		c.recordStaleDrop(service)
		return nil
	}
	select {
	case target <- value:
		return nil
	case <-c.wait(ctx, outputBackpressure):
		return errors.New("pipeline output backpressure timeout")
	case <-ctx.Done():
		return ErrClosed
	}
}
