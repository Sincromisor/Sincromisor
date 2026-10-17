"""同梱固定音声について旧一括認識と段階別認識の候補・スコアを照合する。"""

import json
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from omegaconf import OmegaConf
from reazonspeech.nemo.asr.audio import norm_audio, pad_audio
from reazonspeech.nemo.asr.decode import decode_hypothesis
from reazonspeech.nemo.asr.interface import AudioData
from speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemo import (
    SpeechRecognizerNemo,
)


def legacy(recognizer, voice):
    padded = pad_audio(norm_audio(AudioData(voice, 16000)), recognizer.PAD_SECONDS)
    output = recognizer.model.transcribe(
        padded.waveform,
        batch_size=1,
        return_hypotheses=True,
        partial_hypothesis=None,
        verbose=False,
    )
    hyp = output[0]
    primary = hyp[0] if isinstance(hyp, list) else hyp
    result = decode_hypothesis(recognizer.model, primary)
    if isinstance(hyp, list):
        return [(candidate.text or "", candidate.score) for candidate in hyp]
    return [(hyp.text or result.text, hyp.score)]


def compare():
    voice = np.fromfile(
        "speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/sample02_f32le.raw",
        dtype=np.float32,
    )
    voice = (voice * 32767).clip(-32768, 32767).astype(np.int16)
    recognizer = SpeechRecognizerNemo()
    original = OmegaConf.create(recognizer.model.cfg.decoding)
    report = {}
    try:
        for name, config in (
            ("normal", original),
            (
                "nbest",
                recognizer.build_decoding_config(
                    strategy="alsd", beam_size=4, return_best_hypothesis=False
                ),
            ),
        ):
            recognizer.model.change_decoding_strategy(config, verbose=False)
            before = legacy(recognizer, voice)
            after = recognizer.transcribe_with_score(voice)
            assert before == after, (name, before, after)
            report[name] = {
                "candidates": len(after),
                "max_score_difference": 0,
                "identical": True,
            }
    finally:
        recognizer.model.change_decoding_strategy(original, verbose=False)
    print(json.dumps(report))


with ThreadPoolExecutor(max_workers=1) as executor:
    executor.submit(compare).result()
