"""SileroとSmart TurnのONNX境界。重みを共有し、VADの履歴は接続側が所有する。"""

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import onnxruntime as ort

from .model_assets import DEFAULT_MODEL_DIR, verified_model
from .whisper_features import compute_whisper_log_mel_features


@dataclass
class VadMemory:
    """接続ごとの再帰状態。別接続や再接続へ引き継がない。"""

    state: np.ndarray = field(default_factory=lambda: np.zeros((2, 1, 128), np.float32))
    context: np.ndarray = field(default_factory=lambda: np.zeros((1, 64), np.float32))


def _session(path: Path) -> ort.InferenceSession:
    """小モデルをCPUの1スレッドで動かし、接続数による内部スレッド増殖を避ける。"""
    options = ort.SessionOptions()
    options.inter_op_num_threads = 1
    options.intra_op_num_threads = 1
    return ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])


def _probability(value: object) -> float:
    """モデル出力の非有限値や形状異常を業務判定へ流さない。"""
    if not isinstance(value, np.ndarray) or value.size != 1:
        raise ValueError("Invalid endpoint probability shape")
    result = float(value.item())
    if not np.isfinite(result) or not 0 <= result <= 1:
        raise ValueError("Invalid endpoint probability")
    return result


class EndpointModels:
    """サービス起動時に2モデルを検証・ロードする。起動後の外部取得は行わない。"""

    def __init__(self, directory: Path = DEFAULT_MODEL_DIR) -> None:
        ort.disable_telemetry_events()
        self.vad = _session(verified_model(directory, "silero-v6.2.onnx"))
        self.turn = _session(verified_model(directory, "smart-turn-v3.2-cpu.onnx"))

    def speech_probability(self, pcm: np.ndarray, memory: VadMemory) -> float:
        """16kHzの512サンプルを順に消費する。同じmemoryへの並行呼出しは禁止。"""
        if pcm.shape != (512,) or pcm.dtype != np.int16:
            raise ValueError("VAD requires 512 mono int16 samples")
        frame = pcm.astype(np.float32).reshape(1, -1) / 32768.0
        result, state = self.vad.run(
            ["output", "stateN"],
            {
                "input": np.concatenate((memory.context, frame), axis=1),
                "state": memory.state,
                "sr": np.array(16000, dtype=np.int64),
            },
        )
        probability = _probability(result)
        if (
            not isinstance(state, np.ndarray)
            or state.shape != (2, 1, 128)
            or not np.isfinite(state).all()
        ):
            raise ValueError("Invalid VAD state")
        memory.state = state
        memory.context = frame[:, -64:].copy()
        return probability

    def completion_probability(self, pcm: np.ndarray) -> float:
        """現在の発話の末尾8秒を特徴量化する。短い発話は先頭をゼロで埋める。"""
        if pcm.ndim != 1 or pcm.size == 0 or pcm.dtype != np.int16:
            raise ValueError("Smart Turn requires nonempty mono int16 samples")
        audio = pcm[-128000:].astype(np.float32) / 32768.0
        audio = np.pad(audio, (128000 - audio.size, 0))
        features = compute_whisper_log_mel_features(audio, do_normalize=True)
        result = self.turn.run(None, {"input_features": features[np.newaxis, :]})
        return _probability(result[0])
