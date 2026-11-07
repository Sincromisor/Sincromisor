"""接続内の差分PCMを検証・累積し、一つの発話だけを認識へ貸し出す。"""

import math

import numpy as np
from sincro_models import SpeechExtractorResult


class RecognitionInput:
    """処理タスクが所有するバッファ。認識終了までは次の差分を書き込まない。"""

    # 保存側も単独64MiBを上限とする。音声を切り捨てず、超過を接続異常へ伝える。
    MAX_SAMPLES = 64 * 1024 * 1024 // 2

    def __init__(self) -> None:
        self.session_id: str | None = None
        self.speech_id = -1
        self.sequence_id = -1
        self.confirmed = True
        self.buffer = np.empty(0, dtype=np.int16)
        self.used = 0

    def append(self, request: SpeechExtractorResult) -> None:
        """形式と順序を検証して累積範囲を要求へ貸し出す。通番の欠番は結合差分として許す。"""
        self._validate(request)
        if request.speech_id != self.speech_id:
            self.used = 0
        needed = self.used + request.voice.size
        if not 0 < needed <= self.MAX_SAMPLES:
            raise ValueError("Recognition audio must be nonempty and within 64 MiB.")
        if needed > self.buffer.size:
            expanded = np.empty(
                min(self.MAX_SAMPLES, max(needed, self.buffer.size * 2)), dtype=np.int16
            )
            expanded[: self.used] = self.buffer[: self.used]
            self.buffer = expanded
        np.copyto(self.buffer[self.used : needed], request.voice, casting="no")
        self.used = needed
        self.session_id = request.session_id
        self.speech_id = request.speech_id
        self.sequence_id = request.sequence_id
        self.confirmed = request.confirmed
        request.voice = self.buffer[: self.used]

    def _validate(self, request: SpeechExtractorResult) -> None:
        """音声をコピーする前にGoの形式と接続内の順序を確認する。未確定音声は黙って捨てない。"""
        if (
            request.voice_dtype != "int16"
            or request.voice.dtype != np.dtype(np.int16)
            or request.voice.ndim != 1
            or request.voice_sampling_rate != 16000
            or request.voice_sample_bytes != 2
            or request.voice_channels != 1
        ):
            raise ValueError("Recognizer requires 16 kHz mono int16 PCM.")
        if (
            not request.session_id
            or (self.session_id is not None and request.session_id != self.session_id)
            or request.speech_id < 0
            or request.sequence_id <= self.sequence_id
            or not math.isfinite(request.start_at)
        ):
            raise ValueError("Invalid recognition session, sequence or timestamp.")
        if request.speech_id == self.speech_id:
            if self.confirmed:
                raise ValueError("Confirmed speech cannot receive more audio.")
        elif request.speech_id < self.speech_id or not self.confirmed:
            raise ValueError(
                "New speech must follow confirmation of the previous speech."
            )

    def release_confirmed(self) -> None:
        """認識と保存受渡し終了後に確定音声の参照を外し、大きな確保を接続に残さない。"""
        if self.confirmed:
            self.buffer = np.empty(0, dtype=np.int16)
            self.used = 0
