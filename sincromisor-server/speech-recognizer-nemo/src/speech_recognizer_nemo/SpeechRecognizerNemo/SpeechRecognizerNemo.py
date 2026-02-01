import numpy as np
from nemo.collections.asr.models import EncDecRNNTBPEModel
from nemo.collections.asr.parts.utils.rnnt_utils import Hypothesis
from reazonspeech.nemo.asr import load_model
from reazonspeech.nemo.asr.audio import norm_audio, pad_audio
from reazonspeech.nemo.asr.decode import decode_hypothesis
from reazonspeech.nemo.asr.interface import (
    AudioData,
    TranscribeConfig,
    TranscribeResult,
)


class SpeechRecognizerNemo:
    PAD_SECONDS = 0.5

    def __init__(self):
        self.model: EncDecRNNTBPEModel = load_model()
        self.transcribe_config: TranscribeConfig = TranscribeConfig()
        self.transcribe_config.verbose = False
        self.transcribe_config.raw_hypothesis = True

    def transcribe(self, audio: np.ndarray) -> TranscribeResult:
        """Inference audio data using NeMo model

        Args:
            audio (AudioData): Audio data to transcribe, 16000Hz, 1ch, float32

        Returns:
            TranscribeResult
        """
        org_audio: AudioData = AudioData(audio, 16000)
        padded_audio: AudioData = pad_audio(norm_audio(org_audio), self.PAD_SECONDS)

        # partial_hypothesis は未実装となっているため、Noneを指定する。
        # NotImplementedError("`partial_hypotheses` support is not supported")
        # https://github.com/NVIDIA/NeMo/blob/45a3b5cad3434692b1fb805934913d95be8668ea/nemo/collections/asr/parts/submodules/rnnt_beam_decoding.py#L871

        # list[Hypothesis]になる模様
        hyp: list[str] | list[Hypothesis] | tuple[list[str]] | tuple[list[Hypothesis]]  = self.model.transcribe(
            padded_audio.waveform,
            batch_size=1,
            return_hypotheses=True,
            partial_hypothesis=None,
            verbose=self.transcribe_config.verbose,
        )
        hyp: str | Hypothesis | list[str] | list[Hypothesis] = hyp[0]
        ts_result: TranscribeResult = decode_hypothesis(self.model, hyp)

        if self.transcribe_config.raw_hypothesis:
            ts_result.hypothesis = hyp

        return ts_result

    # 音声認識結果を、次の形式で返す。
    # [('認識したテキスト1', 0.0～1.0のスコア), ('認識したテキスト2', 0.0～1.0のスコア)]
    def transcribe_with_score(
        self,
        audio: np.ndarray,
    ) -> list[tuple[str, float]]:
        ts_result: TranscribeResult = self.transcribe(audio)
        return [(ts_result.text, ts_result.hypothesis.score)]

if __name__ == "__main__":
    from pprint import pprint

    import numpy as np

    data = np.fromfile("sample_f32le.raw", dtype=np.float32)
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