"""PCM位置を基準に発話を組み立てる。推論と通信はWorkerが担当する。"""

import time
from collections import deque

import numpy as np
from sincro_models import SpeechExtractorResult


class TurnState:
    """接続内で一つだけ持つ。差分送信バッファと推論用履歴を別々に保持する。"""

    SAMPLE_RATE = 16000
    PRE_ROLL = 8000
    HISTORY = 128000
    PARTIAL = 3200
    # 未完了のまま待ち続けない上限。品質評価前の初期値であり最適値ではない。
    MAX_SILENCE = 48000

    def __init__(self, session_id: str, max_silence_ms: int) -> None:
        if not 1 <= max_silence_ms <= 3000:
            raise ValueError("max_silence_ms must be between 1 and 3000")
        self.candidate_samples = max_silence_ms * 16
        self.result = SpeechExtractorResult(session_id=session_id, start_at=-1)
        self.position = 0
        self.last_speech = 0
        self.silence = 0
        self.active = False
        self.vad_active = False
        self.attempted: tuple[int, int] | None = None
        self.history: deque[np.ndarray] = deque()
        self.history_size = 0
        self.unsent: list[np.ndarray] = []
        self.unsent_size = 0

    @property
    def token(self) -> tuple[int, int]:
        """発話IDと最後のSpeech末尾位置。再開発話で旧判定を無効にする。"""
        return self.result.speech_id, self.last_speech

    def feed(self, pcm: np.ndarray, probability: float) -> SpeechExtractorResult | None:
        """32msの連続PCMを保持し、発話中だけ約200msごとに差分を返す。"""
        self.position += pcm.size
        # 開始と終了の閾値を分け、境界付近の確率で状態が往復することを抑える。
        self.vad_active = probability >= (0.35 if self.vad_active else 0.5)
        self.history.append(pcm)
        self.history_size += pcm.size
        if self.vad_active:
            self.last_speech = self.position
            self.silence = 0
        elif self.active:
            self.silence += pcm.size
        if not self.active:
            if not self.vad_active:
                self._trim_history(self.PRE_ROLL)
                return None
            self.active = True
            self.result.start_at = time.time()
            self.unsent = list(self.history)
            self.unsent_size = self.history_size
        else:
            self.unsent.append(pcm)
            self.unsent_size += pcm.size
        self._trim_history(self.HISTORY)
        # 無音は次の発話再開か終端で送る。確定パケットを非空に保つ。
        if self.vad_active and self.unsent_size >= self.PARTIAL:
            return self._emit(False)
        return None

    def candidate(self) -> tuple[tuple[int, int], np.ndarray] | None:
        """同じ休止では一度だけ推論する。履歴は別スレッドへ渡せる所有コピーにする。"""
        if (
            not self.active
            or self.silence < self.candidate_samples
            or self.attempted == self.token
        ):
            return None
        self.attempted = self.token
        return self.token, np.concatenate(tuple(self.history))

    def accepts(self, token: tuple[int, int]) -> bool:
        """発話再開・確定後の遅着を拒否する。"""
        return (
            self.active
            and self.silence >= self.candidate_samples
            and token == self.token
        )

    def finish(self) -> SpeechExtractorResult:
        """保持した無音まで一度だけ送る。次発話へ音声もモデル判定も持ち越さない。"""
        if not self.active or not self.unsent_size:
            raise RuntimeError("Cannot finish inactive or empty turn")
        result = self._emit(True)
        self.result.speech_id += 1
        self.result.start_at = -1
        self.active = False
        self.vad_active = False
        self.silence = 0
        self.attempted = None
        self.history.clear()
        self.history_size = 0
        return result

    def _emit(self, confirmed: bool) -> SpeechExtractorResult:
        """送信済みPCMを再送しない。結果オブジェクトも送信キューへ所有権を渡す。"""
        self.result.sequence_id += 1
        result = self.result.model_copy(
            update={"voice": np.concatenate(self.unsent), "confirmed": confirmed}
        )
        self.unsent = []
        self.unsent_size = 0
        return result

    def _trim_history(self, limit: int) -> None:
        """切り捨ては先頭だけに限定し、時間軸上の間を詰めない。"""
        while self.history_size > limit:
            first = self.history.popleft()
            excess = self.history_size - limit
            removed = min(excess, first.size)
            self.history_size -= removed
            if removed < first.size:
                self.history.appendleft(first[removed:])
