"""同じPCMで旧YAMNet方式と新終端方式を逐次再生する。通信・並行実行の評価は含めない。"""

import time
from collections.abc import Callable
from typing import TYPE_CHECKING

import numpy as np

from .evaluation_metrics import Emission, EvaluationRun
from .turn_state import TurnState

if TYPE_CHECKING:
    from .endpoint_models import EndpointModels


def run_legacy(
    pcm: np.ndarray, classify: Callable[[np.ndarray], bool], silence_ms: int
) -> EvaluationRun:
    """基点の200ms非重複窓・500ms先行音声・Speech時の差分送信を再現する。"""
    result = EvaluationRun()
    pending = np.empty(0, np.int16)
    active, silence = False, 0
    started = time.perf_counter()
    for start in range(0, pcm.size - 3199, 3200):
        frame = pcm[start : start + 3200]
        speech = classify(frame)
        pending = np.concatenate((pending, frame))
        result.processed_samples = start + 3200
        if speech:
            active, silence = True, 0
        if not active:
            pending = pending[-8000:]
            continue
        if not speech:
            silence += 200
        confirmed = not speech and silence >= silence_ms
        if speech or confirmed:
            result.emissions.append(
                Emission(
                    result.processed_samples - pending.size,
                    result.processed_samples,
                    confirmed,
                )
            )
            pending = np.empty(0, np.int16)
        if confirmed:
            active, silence = False, 0
    result.compute_ms = (time.perf_counter() - started) * 1000
    return result


def run_smart(
    pcm: np.ndarray, models: EndpointModels, silence_ms: int
) -> EvaluationRun:
    """本番TurnStateと同じ閾値で逐次判定する。推論中の音声到着や待ち行列は再現しない。"""
    from .endpoint_models import VadMemory

    result = EvaluationRun()
    state, memory = TurnState("evaluation", silence_ms), VadMemory()
    started = time.perf_counter()
    for start in range(0, pcm.size - 511, 512):
        frame = pcm[start : start + 512]
        partial = state.feed(frame, models.speech_probability(frame, memory))
        result.processed_samples = state.position
        if partial is not None:
            result.emissions.append(
                Emission(state.position - partial.voice.size, state.position, False)
            )
        candidate = state.candidate()
        complete = False
        if candidate is not None:
            token, audio = candidate
            result.turn_inferences += 1
            complete = (
                state.accepts(token) and models.completion_probability(audio) > 0.5
            )
        if state.active and (complete or state.silence >= state.MAX_SILENCE):
            final = state.finish()
            result.emissions.append(
                Emission(state.position - final.voice.size, state.position, True)
            )
    result.compute_ms = (time.perf_counter() - started) * 1000
    return result
