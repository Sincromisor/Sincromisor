package pipeline

import (
	"errors"
	"time"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

// generation pipeline position:
// browser PCM → extraction → recognition → processor → synthesized output.
// Each loop is tied to one generation context; no stage retries an in-flight item.
func (c *Coordinator) pcmLoop(work *generationWork, extractor ExtractorClient) {
	defer work.wg.Done()
	for {
		select {
		case <-work.ctx.Done():
			return
		case frame, ok := <-work.input.values:
			if !ok {
				return
			}
			if err := extractor.SendPCM(work.ctx, frame); err != nil {
				c.requestReset(work.number, pclient.ServiceExtractor, err)
				return
			}
		}
	}
}

func (c *Coordinator) extractorLoop(work *generationWork, extractor ExtractorClient, recognizer RecognizerClient) {
	defer work.wg.Done()
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-extractor.Results():
			if !ok {
				return
			}
			combined, err := work.conv.acceptExtraction(value)
			if err == nil {
				err = recognizer.SendExtraction(work.ctx, combined)
			}
			if err != nil {
				c.requestReset(work.number, pclient.ServiceExtractor, err)
				return
			}
		}
	}
}

func (c *Coordinator) recognizerLoop(work *generationWork, recognizer RecognizerClient, processor ProcessorClient) {
	defer work.wg.Done()
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-recognizer.Results():
			if !ok {
				return
			}
			if _, err := work.conv.acceptRecognition(value); err != nil {
				c.requestReset(work.number, pclient.ServiceRecognizer, err)
				return
			}
			message := work.conv.recognitionMessage(value)
			if message.MessageID == "" {
				c.requestReset(work.number, pclient.ServiceRecognizer, errors.New("recognizer changed current speech"))
				return
			}
			if err := c.publishText(work.number, message); err != nil {
				c.requestReset(work.number, pclient.ServiceRecognizer, err)
				return
			}
			c.mu.Lock()
			if value.Confirmed {
				c.history = append(c.history, message)
			}
			history := cloneMessages(c.history)
			c.mu.Unlock()
			request := protocol.ProcessorRequest{
				SessionID: value.SessionID, SequenceID: value.SequenceID, Confirmed: value.Confirmed,
				History: protocol.ChatHistory{Messages: history}, RequestMessage: message,
			}
			work.conv.rememberRequest(request)
			if err := processor.SendRequest(work.ctx, request); err != nil {
				c.requestReset(work.number, pclient.ServiceProcessor, err)
				return
			}
		}
	}
}

func (c *Coordinator) processorLoop(work *generationWork, processor ProcessorClient, synth SynthesizerClient) {
	defer work.wg.Done()
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-processor.Results():
			if !ok {
				return
			}
			_, final, err := work.conv.validateProcessor(value)
			if err != nil {
				c.requestReset(work.number, pclient.ServiceProcessor, err)
				return
			}
			if err = c.publishText(work.number, value.ResponseMessage); err != nil {
				c.requestReset(work.number, pclient.ServiceProcessor, err)
				return
			}
			if final {
				c.mu.Lock()
				c.history = cloneMessages(value.History.Messages)
				c.mu.Unlock()
			}
			if value.VoiceText != nil && *value.VoiceText != "" {
				if err = synth.SendResult(work.ctx, value); err != nil {
					c.requestReset(work.number, pclient.ServiceSynthesizer, err)
					return
				}
			}
		}
	}
}

func (c *Coordinator) synthLoop(work *generationWork, synth SynthesizerClient) {
	defer work.wg.Done()
	for {
		select {
		case <-work.ctx.Done():
			return
		case value, ok := <-synth.Results():
			if !ok {
				return
			}
			if err := c.publishSynth(work.number, value); err != nil {
				c.requestReset(work.number, pclient.ServiceSynthesizer, err)
				return
			}
		}
	}
}

func (c *Coordinator) publishText(generation uint64, value protocol.ChatMessage) error {
	return publish(c, generation, c.textOut, Output[protocol.ChatMessage]{Generation: generation, Value: value})
}

func (c *Coordinator) publishSynth(generation uint64, value protocol.SynthesizerResult) error {
	return publish(c, generation, c.synthOut, Output[protocol.SynthesizerResult]{Generation: generation, Value: value})
}

// publish and reset share outputMu as the external generation barrier. A producer
// rechecks state after entering it, while reset advances generation and drains old
// envelopes before releasing it.
func publish[T any](c *Coordinator, generation uint64, target chan Output[T], value Output[T]) error {
	c.outputMu.Lock()
	defer c.outputMu.Unlock()
	c.mu.Lock()
	current, running := c.generation, c.state == StateRunning
	ctx := c.sessionCtx
	c.mu.Unlock()
	if !running || current != generation {
		c.logger.Info("dropped stale pipeline result", "generation", generation)
		return nil
	}
	timer := time.NewTimer(outputBackpressure)
	defer timer.Stop()
	select {
	case target <- value:
		return nil
	case <-timer.C:
		return errors.New("pipeline output backpressure timeout")
	case <-ctx.Done():
		return ErrClosed
	}
}
