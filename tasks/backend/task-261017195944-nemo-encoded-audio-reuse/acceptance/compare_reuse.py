"""固定音声の通常・補強・N-bestを、従来の再エンコードと一要求内再利用で照合する。"""

import hashlib
import json
import weakref
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from time import perf_counter

import numpy as np
import torch
from omegaconf import OmegaConf
from speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemo import (
    SpeechRecognizerNemo,
)


def compare():
    path = Path(
        "speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/sample02_f32le.raw"
    )
    voice = np.fromfile(path, dtype=np.float32)
    voice = (voice * 32767).clip(-32768, 32767).astype(np.int16)
    recognizer = SpeechRecognizerNemo()
    original = OmegaConf.create(recognizer.model.cfg.decoding)
    settings = {
        "biasing": {
            "strategy": "malsd_batch",
            "beam_size": 4,
            "boosting_phrases": ["雪", "青空"],
            "boosting_tree_alpha": 1.0,
            "allow_cuda_graphs": False,
        },
        "nbest": {"strategy": "alsd", "beam_size": 4},
    }

    def legacy_candidates(options):
        config = recognizer.build_decoding_config(
            return_best_hypothesis=False, **options
        )
        try:
            recognizer.model.change_decoding_strategy(config, verbose=False)
            return recognizer.transcribe_with_score(voice)
        finally:
            recognizer.model.change_decoding_strategy(original, verbose=False)

    recognizer.transcribe_with_score(voice)  # モデル初回実行の準備は測定から除く。
    torch.cuda.synchronize()
    started = perf_counter()
    before = {"normal": recognizer.transcribe_with_score(voice)}
    before.update(
        (name, legacy_candidates(options)) for name, options in settings.items()
    )
    torch.cuda.synchronize()
    before_seconds = perf_counter() - started
    # NeMoはchange_decoding_strategyで省略設定を補完する。旧経路も同じ復元後設定になる。
    restored = OmegaConf.to_container(recognizer.model.cfg.decoding)
    started = perf_counter()
    encoded = recognizer.encode(voice)
    refs = [weakref.ref(tensor) for tensor in encoded]
    try:
        after = {"normal": recognizer.decode_with_score(encoded)}
        after.update(
            (name, recognizer.decode_candidates(encoded, **options))
            for name, options in settings.items()
        )
    finally:
        del encoded
    torch.cuda.synchronize()
    after_seconds = perf_counter() - started
    assert all(ref() is None for ref in refs)
    assert OmegaConf.to_container(recognizer.model.cfg.decoding) == restored
    assert before == after, "candidate text, order or score changed"
    print(
        json.dumps(
            {
                "input_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "candidates": {name: len(result) for name, result in after.items()},
                "identical_text_order_scores": True,
                "encoded_references_released": True,
                "encode_calls_before": 3,
                "encode_calls_after": 1,
                "seconds_before": before_seconds,
                "seconds_after": after_seconds,
            }
        )
    )


with ThreadPoolExecutor(max_workers=1) as executor:
    executor.submit(compare).result()
