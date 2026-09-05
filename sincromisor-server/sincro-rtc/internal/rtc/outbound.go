package rtc

import (
	"context"
	"errors"

	outputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// startOutbound は通信接続後に予約した送信時計と、世代・文字・合成音声の受信処理を開始する。
// 世代通知はgenerationLoopだけが受信し、文字と音声も同じapplyGenerationで世代を検査する。
// 各処理はセッションの中断で停止し、終了処理が完了を待つ。
func (s *Session) startOutbound() {
	s.goReserved("outbound_clock", func(context.Context) { s.outputLoop() })
	s.goReserved("pipeline_generation", func(context.Context) { s.generationLoop() })
	s.goReserved("pipeline_text", func(context.Context) { s.textOutputLoop() })
	s.goReserved("pipeline_synth", func(context.Context) { s.synthOutputLoop() })
}

// outputLoop は音声の送信時計を動かし、送信失敗をセッションの終了へ集約する。
func (s *Session) outputLoop() {
	err := s.output.Run(s.ctx)
	if err == nil || errors.Is(err, context.Canceled) {
		return
	}
	s.logger.Error("outbound audio processing stopped", "session_id", s.id, "reason", "media_write_error")
	_ = s.Close("outbound_error")
}

// generationLoop は後続の出力がなくても世代更新を適用し、古い出力を破棄する。
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
			// 通知だけの適用はエラーを返さず、古い通知は無視する。
			_, _ = s.applyGeneration(generation, nil)
		}
	}
}

// textOutputLoop は現世代の文字だけを配送し、配送待ちの上限超過ではセッションを終了する。
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
			_, err := s.applyGeneration(output.Generation, func() error {
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

// synthOutputLoop は合成結果を発話順に復号・追加し、追加失敗ではセッションを終了する。
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

// handleSynthOutput は復号前後の世代を検査し、現世代の結果だけを発話キューへ追加する。
// 復号中に終了または再初期化した場合は、Enqueueの終了判定または世代の再検査で結果を拒否する。
func (s *Session) handleSynthOutput(output pipeline.Output[protocol.SynthesizerResult]) error {
	accepted, _ := s.applyGeneration(output.Generation, nil)
	if !accepted {
		return nil
	}
	decoded, err := s.synthDecoder.Decode(s.ctx, output.Value)
	if err != nil {
		if s.isCurrentGeneration(output.Generation) && s.ctx.Err() == nil {
			codecErrorKind, codecErrorReason := codecErrorDetails(err)
			s.logger.Error("synthesized audio decode failed", "session_id", s.id, "reason", "codec_error", "codec_error_kind", codecErrorKind, "codec_error_reason", codecErrorReason)
			s.metrics().CodecError("decode_synth")
			_ = s.Close("codec_error")
		}
		return nil
	}
	_, err = s.applyGeneration(output.Generation, func() error {
		return s.output.Enqueue(output.Value.Message, decoded)
	})
	if errors.Is(err, outputmedia.ErrOutputClosed) {
		return nil
	}
	return err
}

// codecErrorDetails はdecoder原因をログ用の固定値域へ閉じ、Causeの自由文を観測境界へ出さない。
func codecErrorDetails(err error) (string, string) {
	var decodeErr *synthdecode.DecodeError
	if !errors.As(err, &decodeErr) {
		return "unknown", "unknown"
	}
	codecErrorKind := string(decodeErr.Kind)
	if decodeErr.Kind != synthdecode.ErrorInvalid {
		return codecErrorKind, "unknown"
	}
	switch decodeErr.Reason {
	case "empty_voice", "decoded_pcm_invalid", "speaking_time_mismatch", "mora_timing_invalid", "input_timing_invalid":
		return codecErrorKind, decodeErr.Reason
	default:
		return codecErrorKind, "unknown"
	}
}

// applyGeneration は世代通知と文字・合成音声の出力を一つのロックで適用する。
// 新しい世代では音声・文字・テロップを破棄してからactionを実行する。nilは通知のみを表す。
// ゼロまたは古い世代はfalseで拒否する。trueは世代を受理したことを表し、actionの失敗はerrorで返す。
func (s *Session) applyGeneration(generation uint64, action func() error) (bool, error) {
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
	if action != nil {
		return true, action()
	}
	return true, nil
}

// isCurrentGeneration は復号中の世代変更を確認し、古い合成結果の失敗で現世代を終了させない。
func (s *Session) isCurrentGeneration(generation uint64) bool {
	s.outboundMu.Lock()
	defer s.outboundMu.Unlock()
	return generation == s.outboundGeneration
}
