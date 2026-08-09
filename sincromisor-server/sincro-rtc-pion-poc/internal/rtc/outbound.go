package rtc

import (
	"context"
	"errors"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

// startOutbound はtransport connectedで予約済みのclockと3つのpipeline consumerを開始する。
//
// GenerationChangesはgenerationLoopだけが受信する。text/synth envelopeも同じapplyGenerationを通り、
// より新しいgenerationを最初に観測したgoroutineがaudio/text/telopを一括purgeする。これにより
// channel間のselect順序や複数receiverへの誤ったbroadcast期待へ正しさを依存させない。
func (s *Session) startOutbound() {
	s.goReserved("outbound_clock", func(context.Context) { s.outputLoop() })
	s.goReserved("pipeline_generation", func(context.Context) { s.generationLoop() })
	s.goReserved("pipeline_text", func(context.Context) { s.textOutputLoop() })
	s.goReserved("pipeline_synth", func(context.Context) { s.synthOutputLoop() })
}

func (s *Session) outputLoop() {
	err := s.output.Run(s.ctx)
	if err == nil || errors.Is(err, context.Canceled) {
		return
	}
	s.logger.Error("outbound audio processing stopped", "session_id", s.id, "reason", "media_write_error")
	_ = s.Close("outbound_error")
}

func (s *Session) generationLoop() {
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
				s.logger.Error("outbound text enqueue failed", "session_id", s.id, "reason", "output_backpressure")
				_ = s.Close("output_backpressure")
				return
			}
		}
	}
}

func (s *Session) synthOutputLoop() {
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
			err := s.handleSynthOutput(output)
			if err != nil {
				s.logger.Error("outbound speech enqueue failed", "session_id", s.id, "reason", "output_backpressure")
				_ = s.Close("output_backpressure")
				return
			}
		}
	}
}

// handleSynthOutput はenvelope generationをdecode前後で確認し、current resultだけをspeech queueへ渡す。
//
// Closeまたはresetがdecode中に勝った場合、closed-aware Enqueueまたはgeneration再検査が結果を拒否し、
// consumer終了後に未所有queueを復活させない。
func (s *Session) handleSynthOutput(output pipeline.Output[protocol.SynthesizerResult]) error {
	if !s.applyGeneration(output.Generation, nil) {
		return nil
	}
	decoded, err := s.synthDecoder.Decode(s.ctx, output.Value)
	if err != nil {
		if s.isCurrentGeneration(output.Generation) && s.ctx.Err() == nil {
			codecErrorKind := "unknown"
			var decodeErr *synthdecode.DecodeError
			if errors.As(err, &decodeErr) {
				codecErrorKind = string(decodeErr.Kind)
			}
			s.logger.Error("synthesized audio decode failed", "session_id", s.id, "reason", "codec_error", "codec_error_kind", codecErrorKind)
			s.metrics().CodecError("decode_synth")
			_ = s.Close("codec_error")
		}
		return nil
	}
	_, err = s.applyGenerationError(output.Generation, func() error {
		return s.output.Enqueue(output.Value.Message, decoded)
	})
	if errors.Is(err, audiomedia.ErrOutputClosed) {
		return nil
	}
	return err
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
