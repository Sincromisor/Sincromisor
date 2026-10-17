from collections.abc import Generator
from contextlib import contextmanager

import numpy as np
import torch
from nemo.collections.asr.models import EncDecRNNTBPEModel
from nemo.collections.asr.parts.context_biasing import BoostingTreeModelConfig
from nemo.collections.asr.parts.mixins.transcription import InternalTranscribeConfig
from nemo.collections.asr.parts.mixins.transcription import (
    TranscribeConfig as NemoTranscribeConfig,
)
from nemo.collections.asr.parts.utils.rnnt_utils import Hypothesis
from omegaconf import DictConfig, OmegaConf
from reazonspeech.nemo.asr import load_model
from reazonspeech.nemo.asr.audio import norm_audio, pad_audio
from reazonspeech.nemo.asr.decode import decode_hypothesis
from reazonspeech.nemo.asr.interface import (
    AudioData,
    TranscribeConfig,
    TranscribeResult,
)

# 一要求の通常認識と候補再試行で共有する、エンコーダー出力と有効長。
type EncodedAudio = tuple[torch.Tensor, torch.Tensor]


class SpeechRecognizerNemo:
    """NeMo / ReazonSpeech の推論呼び出しを、このサービス向けに薄く包む。"""

    # pkg/nemo-asr/src/decode.pyと同じ
    PAD_SECONDS = 0.5

    def __init__(self) -> None:
        # モデル本体と既定の decode 設定を初期化しておき、
        # 後段で一時的に decoding strategy を差し替えられるようにする。
        self.model: EncDecRNNTBPEModel = load_model()
        self.transcribe_config: TranscribeConfig = TranscribeConfig()
        self.transcribe_config.verbose = False
        self.transcribe_config.raw_hypothesis = True
        self.default_decoding_config: DictConfig = OmegaConf.create(
            self.model.cfg.decoding
        )

    @contextmanager
    def _inference(
        self, audio: np.ndarray | torch.Tensor
    ) -> Generator[NemoTranscribeConfig]:
        """採用NeMoの推論準備・復元を使い、dither・pad_to・eval・凍結状態を揃える。"""
        config = NemoTranscribeConfig(
            batch_size=1,
            return_hypotheses=True,
            num_workers=0,
            verbose=self.transcribe_config.verbose,
            _internal=InternalTranscribeConfig(),
        )
        try:
            self.model._transcribe_on_begin(audio, config)  # noqa: SLF001  # reason: 採用NeMoの状態準備を複製せず利用する。
            yield config
        finally:
            self.model._transcribe_on_end(config)  # noqa: SLF001  # reason: 採用NeMoと同じ復元を例外時も実行する。

    @torch.inference_mode()
    def encode(self, audio: np.ndarray) -> EncodedAudio:
        """16kHz音声を従来どおり正規化・余白追加し、エンコーダー出力と有効長を返す。"""
        org_audio = AudioData(audio, 16000)  # ty: ignore[invalid-argument-type]  # reason: upstream waveform注釈はnp.float32だが実値はndarray / 解消条件: upstream修正後
        padded = pad_audio(norm_audio(org_audio), self.PAD_SECONDS).waveform
        with self._inference(padded) as config:
            # 採用版のTensor入力経路でdtype・最小長・バッチ化を維持する。
            loader = self.model._transcribe_input_processing(padded, config)  # noqa: SLF001  # reason: 採用NeMoの入力処理を複製しない。
            signal, length, *_ = next(iter(loader))
            device = next(self.model.parameters()).device
            return self.model.forward(
                input_signal=signal.to(device),
                input_signal_length=length.to(device),
            )

    @torch.inference_mode()
    def decode(self, encoded: EncodedAudio) -> TranscribeResult:
        """同一音声のエンコード結果を、現在のデコード設定で候補へ変換する。"""
        with self._inference(encoded[0]):
            transcribe_output = self.model.decoding.rnnt_decoder_predictions_tensor(
                encoded[0],
                encoded[1],
                return_hypotheses=True,
                partial_hypotheses=None,
            )
        if not isinstance(transcribe_output, list | tuple) or not transcribe_output:
            raise TypeError("NeMo transcribe returned an unexpected empty result.")
        hyp = transcribe_output[0]
        # beam search を使う場合でも、まずは先頭候補を decode_hypothesis へ渡して基本結果を組み立てる。
        primary_hypothesis = hyp[0] if isinstance(hyp, list) else hyp
        if not isinstance(primary_hypothesis, str | Hypothesis):
            raise TypeError("NeMo transcribe returned an unsupported hypothesis type.")
        ts_result: TranscribeResult = decode_hypothesis(self.model, primary_hypothesis)

        if self.transcribe_config.raw_hypothesis:
            # 後段で N-best 比較できるよう、生の hypothesis 配列を保持する。
            ts_result.hypothesis = hyp

        return ts_result

    def transcribe(self, audio: np.ndarray) -> TranscribeResult:
        """一要求を一回エンコード・一回デコードし、既存形式で返す。"""
        return self.decode(self.encode(audio))

    def build_decoding_config(
        self,
        *,
        strategy: str | None = None,
        beam_size: int | None = None,
        return_best_hypothesis: bool | None = None,
        boosting_phrases: list[str] | None = None,
        boosting_tree_alpha: float = 0.0,
        allow_cuda_graphs: bool | None = None,
    ) -> DictConfig:
        """一時的な decoding strategy 差し替え用 config を構築する。"""
        config: DictConfig = OmegaConf.create(self.default_decoding_config)

        if strategy is not None:
            config.strategy = strategy
        if beam_size is not None:
            config.beam.beam_size = beam_size
        if return_best_hypothesis is not None:
            config.beam.return_best_hypothesis = return_best_hypothesis
        if allow_cuda_graphs is not None:
            config.beam.allow_cuda_graphs = allow_cuda_graphs

        if boosting_phrases:
            # context biasing では辞書語を boosting tree に投入して、beam 探索を誘導する。
            config.beam.boosting_tree = OmegaConf.structured(
                BoostingTreeModelConfig(
                    key_phrases_list=boosting_phrases,
                    use_triton=False,
                )
            )
            config.beam.boosting_tree_alpha = boosting_tree_alpha

        return config

    def decode_candidates(
        self,
        encoded: EncodedAudio,
        *,
        strategy: str | None = None,
        beam_size: int | None = None,
        boosting_phrases: list[str] | None = None,
        boosting_tree_alpha: float = 0.0,
        allow_cuda_graphs: bool | None = None,
    ) -> list[tuple[str, float]]:
        """同一要求のエンコード結果を、一時的な設定で候補へ再デコードする。"""
        config = self.build_decoding_config(
            strategy=strategy,
            beam_size=beam_size,
            return_best_hypothesis=False,
            boosting_phrases=boosting_phrases,
            boosting_tree_alpha=boosting_tree_alpha,
            allow_cuda_graphs=allow_cuda_graphs,
        )
        original_config: DictConfig = OmegaConf.create(self.model.cfg.decoding)
        try:
            # worker 側で baseline / context biasing / N-best を切り替えるため、
            # ここでのみ一時的に decoding config を入れ替える。
            self.model.change_decoding_strategy(config, verbose=False)
            return self.decode_with_score(encoded)
        finally:
            # 次の推論へ設定が漏れないよう、元の config を必ず復元する。
            self.model.change_decoding_strategy(original_config, verbose=False)

    def transcribe_with_score(
        self,
        audio: np.ndarray,
    ) -> list[tuple[str, float]]:
        """認識結果を、後段で比較しやすい `(text, score)` 形式へ揃えて返す。"""
        return self.decode_with_score(self.encode(audio))

    def decode_with_score(self, encoded: EncodedAudio) -> list[tuple[str, float]]:
        """認識候補の文字列とスコアだけを返し、テンソルを結果へ持ち出さない。"""
        ts_result: TranscribeResult = self.decode(encoded)
        hypothesis = ts_result.hypothesis

        if isinstance(hypothesis, list):
            # N-best のスパイクでは Hypothesis 配列をそのまま score 付き候補列へ変換する。
            candidates: list[tuple[str, float]] = []
            for hyp in hypothesis:
                if not isinstance(hyp, Hypothesis):
                    raise TypeError("N-best hypothesis must contain Hypothesis values.")
                candidates.append((hyp.text or "", hyp.score))
            return candidates

        # 通常推論では単一 hypothesis を1件だけ返す。
        if not isinstance(hypothesis, Hypothesis):
            raise TypeError("Single hypothesis must be a Hypothesis value.")
        hyp = hypothesis
        return [(hyp.text or ts_result.text, hyp.score)]


if __name__ == "__main__":
    from pprint import pprint

    import numpy as np

    data = np.fromfile("sample02_f32le.raw", dtype=np.float32)
    nemo = SpeechRecognizerNemo()
    result: TranscribeResult = nemo.transcribe(data)
    pprint(result)

    result: list[tuple[str, int | float]] = nemo.transcribe_with_score(data)
    pprint(result)
