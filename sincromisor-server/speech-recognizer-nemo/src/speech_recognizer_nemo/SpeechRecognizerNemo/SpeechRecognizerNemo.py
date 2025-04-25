import numpy as np
from nemo.collections.asr.models import EncDecRNNTBPEModel
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
            audio (AudioData): Audio data to transcribe

        Returns:
            TranscribeResult
        """
        org_audio: AudioData = AudioData(audio, 16000)
        padded_audio: AudioData = pad_audio(norm_audio(org_audio), self.PAD_SECONDS)

        # partial_hypothesis は未実装となっているため、Noneを指定する。
        # NotImplementedError("`partial_hypotheses` support is not supported")
        # https://github.com/NVIDIA/NeMo/blob/45a3b5cad3434692b1fb805934913d95be8668ea/nemo/collections/asr/parts/submodules/rnnt_beam_decoding.py#L871

        hyp, _ = self.model.transcribe(
            padded_audio.waveform,
            batch_size=1,
            return_hypotheses=True,
            partial_hypothesis=None,
            verbose=self.transcribe_config.verbose,
        )
        hyp = hyp[0]
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
