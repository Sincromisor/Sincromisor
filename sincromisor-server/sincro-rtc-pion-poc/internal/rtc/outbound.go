package rtc

import (
	"context"
	"errors"
)

// startOutbound はtransport connectedで予約済みのclockと3つのpipeline consumerを開始する。
//
// GenerationChangesはgenerationLoopだけが受信する。text/synth envelopeも同じapplyGenerationを通り、
// より新しいgenerationを最初に観測したgoroutineがaudio/text/telopを一括purgeする。これにより
// channel間のselect順序や複数receiverへの誤ったbroadcast期待へ正しさを依存させない。
func (s *Session) startOutbound() {
	go s.outputLoop()
	go s.generationLoop()
	go s.textOutputLoop()
	go s.synthOutputLoop()
}

func (s *Session) outputLoop() {
	defer s.wg.Done()
	err := s.output.Run(s.ctx)
	if err == nil || errors.Is(err, context.Canceled) {
		return
	}
	s.logger.Error("outbound audio processing stopped", "session_id", s.id, "error", err)
	_ = s.Close("outbound_error")
}

func (s *Session) generationLoop() {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case generation, ok := <-s.pipeline.GenerationChanges():
			if !ok {
				if s.ctx.Err() == nil {
					_ = s.Close("pipeline_output_closed")
				}
				return
			}
			s.applyGeneration(generation, nil)
		}
	}
}

func (s *Session) textOutputLoop() {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case output, ok := <-s.pipeline.TextResults():
			if !ok {
				if s.ctx.Err() == nil {
					_ = s.Close("pipeline_output_closed")
				}
				return
			}
			_, err := s.applyGenerationError(output.Generation, func() error {
				return s.dispatcher.EnqueueText(output.Value)
			})
			if err != nil {
				s.logger.Error("outbound text enqueue failed", "session_id", s.id, "error", err)
				_ = s.Close("output_backpressure")
				return
			}
		}
	}
}

func (s *Session) synthOutputLoop() {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case output, ok := <-s.pipeline.SynthResults():
			if !ok {
				if s.ctx.Err() == nil {
					_ = s.Close("pipeline_output_closed")
				}
				return
			}
			if !s.applyGeneration(output.Generation, nil) {
				continue
			}
			decoded, err := s.synthDecoder.Decode(s.ctx, output.Value)
			if err != nil {
				if s.isCurrentGeneration(output.Generation) && s.ctx.Err() == nil {
					s.logger.Error("synthesized audio decode failed", "session_id", s.id, "error", err)
					_ = s.Close("codec_error")
				}
				continue
			}
			_, err = s.applyGenerationError(output.Generation, func() error {
				return s.output.Enqueue(output.Value.Message, decoded)
			})
			if err != nil {
				s.logger.Error("outbound speech enqueue failed", "session_id", s.id, "error", err)
				_ = s.Close("output_backpressure")
				return
			}
		}
	}
}

// applyGeneration はgeneration通知とtext/synth envelopeの単調増加する単一適用点である。
//
// newerを観測したcritical section内でaudio、text、telopをpurgeしてからincoming actionを実行する。
// older envelope/通知はfalseで破棄されるため、purge後のqueueへ旧generationが再混入しない。
func (s *Session) applyGeneration(generation uint64, action func() error) bool {
	if generation == 0 {
		return false
	}
	s.outboundMu.Lock()
	defer s.outboundMu.Unlock()
	if generation < s.outboundGeneration {
		return false
	}
	if generation > s.outboundGeneration {
		s.output.Purge()
		s.dispatcher.Purge()
		s.outboundGeneration = generation
	}
	if action != nil {
		if err := action(); err != nil {
			return false
		}
	}
	return true
}

// applyGenerationError はapplyGenerationと同じbarrierでaction errorをcallerへ返す。
func (s *Session) applyGenerationError(generation uint64, action func() error) (bool, error) {
	if generation == 0 {
		return false, nil
	}
	s.outboundMu.Lock()
	defer s.outboundMu.Unlock()
	if generation < s.outboundGeneration {
		return false, nil
	}
	if generation > s.outboundGeneration {
		s.output.Purge()
		s.dispatcher.Purge()
		s.outboundGeneration = generation
	}
	return true, action()
}

func (s *Session) isCurrentGeneration(generation uint64) bool {
	s.outboundMu.Lock()
	defer s.outboundMu.Unlock()
	return generation == s.outboundGeneration
}
