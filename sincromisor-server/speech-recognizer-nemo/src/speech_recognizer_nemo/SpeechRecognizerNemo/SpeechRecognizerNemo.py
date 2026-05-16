import numpy as np
from nemo.collections.asr.models import EncDecRNNTBPEModel
from nemo.collections.asr.parts.context_biasing import BoostingTreeModelConfig
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


class SpeechRecognizerNemo:
    """NeMo / ReazonSpeech の推論呼び出しを、このサービス向けに薄く包む。"""

    # pkg/nemo-asr/src/decode.pyと同じ
    PAD_SECONDS = 0.5

    def __init__(self):
        # モデル本体と既定の decode 設定を初期化しておき、
        # 後段で一時的に decoding strategy を差し替えられるようにする。
        self.model: EncDecRNNTBPEModel = load_model()
        self.transcribe_config: TranscribeConfig = TranscribeConfig()
        self.transcribe_config.verbose = False
        self.transcribe_config.raw_hypothesis = True
        self.default_decoding_config: DictConfig = OmegaConf.create(
            self.model.cfg.decoding
        )

    def transcribe(self, audio: np.ndarray) -> TranscribeResult:
        """音声を1回推論し、NeMo の生 hypothesis を含む結果を返す。

        Args:
            audio (AudioData): Audio data to transcribe, 16000Hz, 1ch, float32

        Returns:
            TranscribeResult
        """
        org_audio: AudioData = AudioData(audio, 16000)  # ty: ignore[invalid-argument-type]  # reason: upstream ReazonSpeech annotates waveform as np.float32, but runtime expects ndarray / 解消条件: upstream 型定義修正後に削除
        # 学習・推論時の前提に合わせて正規化し、前後に少し余白を入れて認識を安定させる。
        padded_audio: AudioData = pad_audio(norm_audio(org_audio), self.PAD_SECONDS)

        # partial_hypothesis は未実装となっているため、Noneを指定する。
        # NotImplementedError("`partial_hypotheses` support is not supported")
        # https://github.com/NVIDIA/NeMo/blob/45a3b5cad3434692b1fb805934913d95be8668ea/nemo/collections/asr/parts/submodules/rnnt_beam_decoding.py#L871

        # return_best_hypothesis=False の場合は list[Hypothesis] を受け取る。
        transcribe_output = self.model.transcribe(
            padded_audio.waveform,  # ty: ignore[invalid-argument-type]  # reason: upstream ReazonSpeech annotates waveform as np.float32, but NeMo transcribe expects ndarray at runtime / 解消条件: upstream 型定義修正後に削除
            batch_size=1,
            return_hypotheses=True,
            partial_hypothesis=None,
            verbose=self.transcribe_config.verbose,
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

    def transcribe_candidates(
        self,
        audio: np.ndarray,
        *,
        strategy: str | None = None,
        beam_size: int | None = None,
        boosting_phrases: list[str] | None = None,
        boosting_tree_alpha: float = 0.0,
        allow_cuda_graphs: bool | None = None,
    ) -> list[tuple[str, float]]:
        """一時的な decoding 設定で、候補テキストと score の一覧を返す。"""
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
            return self.transcribe_with_score(audio)
        finally:
            # 次の推論へ設定が漏れないよう、元の config を必ず復元する。
            self.model.change_decoding_strategy(original_config, verbose=False)

    # 音声認識結果を、次の形式で返す。
    # [('認識したテキスト1', 0.0～1.0のスコア), ('認識したテキスト2', 0.0～1.0のスコア)]
    def transcribe_with_score(
        self,
        audio: np.ndarray,
    ) -> list[tuple[str, float]]:
        """認識結果を、後段で比較しやすい `(text, score)` 形式へ揃えて返す。"""
        ts_result: TranscribeResult = self.transcribe(audio)
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

    """
    hyp = self.model.transcribe(
        padded_audio.waveform,
        batch_size=1,
        return_hypotheses=True,
        partial_hypothesis=None,
        verbose=self.transcribe_config.verbose,
    )
    from pprint import pprint
    pprint(hyp)
    [Hypothesis(score=-2.7038905803834474,
                y_sequence=tensor([   2,  113,   31,    5,  146,    7,    8,  422,    7,  821,    4,  298,
            527,    8, 1221,    9,   86,    1]),
                text='こんにちは、きょうは雪がふっています、寒いですね。',
                dec_out=None,
                dec_state=(tensor([[-0.0280,  0.1933,  0.0765,  ...,  0.0186, -0.6637,  0.0114],
            [-0.0356,  0.0083,  0.0024,  ..., -0.0103,  0.0017,  0.0263]]),
                        tensor([[-0.9638,  0.9331,  0.3642,  ...,  0.0205, -0.8669,  0.7254],
            [-0.1018,  0.6993,  0.5472,  ..., -0.5806,  0.0035,  0.6069]])),
                timestamp=[5,
                        9,
                        12,
                        14,
                        17,
                        20,
                        24,
                        29,
                        34,
                        39,
                        44,
                        47,
                        51,
                        60,
                        66,
                        71,
                        74,
                        80],
                alignments=None,
                frame_confidence=None,
                token_confidence=None,
                word_confidence=None,
                length=91,
                y=None,
                lm_state=None,
                lm_scores=None,
                ngram_lm_state=None,
                tokens=None,
                last_token=None,
                token_duration=None,
                last_frame=None)]
    """

    """
    TranscribeResult(text='こんにちは、きょうは雪がふっています、寒いですね。',
                    subwords=[Subword(seconds=0, token_id=113, token='こ'),
                            Subword(seconds=0.06000000000000005,
                                    token_id=31,
                                    token='ん'),
                            Subword(seconds=0.21999999999999997,
                                    token_id=5,
                                    token='に'),
                            Subword(seconds=0.30000000000000004,
                                    token_id=146,
                                    token='ち'),
                            Subword(seconds=0.45999999999999996,
                                    token_id=7,
                                    token='は'),
                            Subword(seconds=0.6200000000000001,
                                    token_id=8,
                                    token='、'),
                            Subword(seconds=0.8600000000000001,
                                    token_id=422,
                                    token='きょう'),
                            Subword(seconds=1.18, token_id=7, token='は'),
                            Subword(seconds=1.5, token_id=821, token='雪'),
                            Subword(seconds=1.8199999999999998,
                                    token_id=4,
                                    token='が'),
                            Subword(seconds=2.14, token_id=298, token='ふ'),
                            Subword(seconds=2.3000000000000003,
                                    token_id=527,
                                    token='っています'),
                            Subword(seconds=2.54, token_id=8, token='、'),
                            Subword(seconds=3.18, token_id=1221, token='寒'),
                            Subword(seconds=3.58, token_id=9, token='い'),
                            Subword(seconds=3.9000000000000004,
                                    token_id=86,
                                    token='ですね'),
                            Subword(seconds=4.0600000000000005,
                                    token_id=1,
                                    token='。')],
                    segments=[Segment(start_seconds=0,
                                    end_seconds=2.62,
                                    text='こんにちは、きょうは雪がふっています、'),
                            Segment(start_seconds=3.18,
                                    end_seconds=4.140000000000001,
                                    text='寒いですね。')],
                    hypothesis=Hypothesis(score=-2.7038905803834474,
                                        y_sequence=tensor([   2,  113,   31,    5,  146,    7,    8,  422,    7,  821,    4,  298,
            527,    8, 1221,    9,   86,    1]),
                                        text='こんにちは、きょうは雪がふっています、寒いですね。',
                                        dec_out=None,
                                        dec_state=(tensor([[-0.0280,  0.1933,  0.0765,  ...,  0.0186, -0.6637,  0.0114],
            [-0.0356,  0.0083,  0.0024,  ..., -0.0103,  0.0017,  0.0263]]),
                                                    tensor([[-0.9638,  0.9331,  0.3642,  ...,  0.0205, -0.8669,  0.7254],
            [-0.1018,  0.6993,  0.5472,  ..., -0.5806,  0.0035,  0.6069]])),
                                        timestamp=[5,
                                                    9,
                                                    12,
                                                    14,
                                                    17,
                                                    20,
                                                    24,
                                                    29,
                                                    34,
                                                    39,
                                                    44,
                                                    47,
                                                    51,
                                                    60,
                                                    66,
                                                    71,
                                                    74,
                                                    80],
                                        alignments=None,
                                        frame_confidence=None,
                                        token_confidence=None,
                                        word_confidence=None,
                                        length=91,
                                        y=None,
                                        lm_state=None,
                                        lm_scores=None,
                                        ngram_lm_state=None,
                                        tokens=None,
                                        last_token=None,
                                        token_duration=None,
                                        last_frame=None))
    """
