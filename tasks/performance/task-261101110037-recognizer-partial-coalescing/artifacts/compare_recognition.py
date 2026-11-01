"""固定WAVを200ms差分と未送信結合で比較し、本文を出さず結果の一致を確かめる。"""

import argparse
import hashlib
import json
import os
import time
import wave
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly
from sincro_models import SpeechExtractorResult
from speech_recognizer_nemo.SpeechRecognizerNemo import SpeechRecognizerNemoWorker


def compare(source: Path) -> dict[str, object]:
    """同じモデルで差分ごとの累積認識と、先頭後の全差分をまとめた認識を実行する。"""
    os.environ["SINCRO_LOG_CONVERSATION_ENABLED"] = "false"
    with wave.open(str(source)) as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError("Fixture must be mono int16 WAV")
        rate = audio.getframerate()
        pcm = np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16)
    pcm = np.clip(
        np.rint(resample_poly(pcm.astype(np.float32), 16000, rate)), -32768, 32767
    ).astype(np.int16)
    chunks = [pcm[i : i + 3200] for i in range(0, len(pcm), 3200)]
    if len(chunks) < 2:
        raise ValueError("Fixture must contain more than 200ms")
    worker = SpeechRecognizerNemoWorker()
    outputs = {}
    for name, groups in [
        ("original", chunks),
        ("coalesced", [chunks[0], np.concatenate(chunks[1:])]),
    ]:
        total = np.empty(0, dtype=np.int16)
        rows = []
        started = time.perf_counter()
        for index, chunk in enumerate(groups):
            total = np.concatenate([total, chunk])
            before = time.perf_counter()
            result, _ = worker.recognize(
                SpeechExtractorResult(
                    session_id="fixture",
                    speech_id=1,
                    sequence_id=index + 1,
                    confirmed=index == len(groups) - 1,
                    start_at=0,
                    voice=total,
                )
            )
            rows.append(
                {
                    "samples": total.size,
                    "elapsed_ms": (time.perf_counter() - before) * 1000,
                    "updated_ms": (time.perf_counter() - started) * 1000,
                }
            )
        outputs[name] = {
            "request_count": len(groups),
            "final_text_sha256": hashlib.sha256(
                result.result_text().encode()
            ).hexdigest(),
            "timings": rows,
            "pcm_sha256": hashlib.sha256(total.tobytes()).hexdigest(),
        }
    assert (
        outputs["original"]["final_text_sha256"]
        == outputs["coalesced"]["final_text_sha256"]
    )
    assert outputs["original"]["pcm_sha256"] == outputs["coalesced"]["pcm_sha256"]
    return {
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "resampled_samples": pcm.size,
        "results": outputs,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    print(json.dumps(compare(parser.parse_args().audio), ensure_ascii=False))
