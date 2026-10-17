"""段階別推論の入力・候補形式と、失敗時のNeMo状態・デコード設定復元を確認する。"""

from importlib import import_module
from types import SimpleNamespace

import numpy as np
import pytest
import torch
from nemo.collections.asr.parts.utils.rnnt_utils import Hypothesis
from omegaconf import OmegaConf
from reazonspeech.nemo.asr.interface import TranscribeConfig
from speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemo import (
    SpeechRecognizerNemo,
)


class Model:
    def __init__(self, failure=None, nbest=False):
        self.active = False
        self.failure = failure
        self.nbest = nbest
        self.input = None
        self.events = []
        self.cfg = SimpleNamespace(decoding=OmegaConf.create({"strategy": "original"}))
        self.decoding = SimpleNamespace(rnnt_decoder_predictions_tensor=self.decode)

    def _transcribe_on_begin(self, audio, config):
        assert torch.is_inference_mode_enabled()
        assert not self.active
        self.active = True
        self.events.append("begin")

    def _transcribe_on_end(self, config):
        self.active = False
        self.events.append("end")

    def _transcribe_input_processing(self, padded, config):
        assert config.batch_size == 1
        return [(torch.as_tensor(padded)[None, :], torch.tensor([len(padded)]))]

    def parameters(self):
        return iter([torch.zeros(1)])

    def forward(self, input_signal, input_signal_length):
        assert self.active
        self.input = input_signal
        self.events.append("encode")
        if self.failure == "encode":
            raise ValueError("encode failed")
        return input_signal, input_signal_length

    def decode(self, encoded, length, **kwargs):
        assert self.active
        assert encoded is self.input
        assert kwargs == {"return_hypotheses": True, "partial_hypotheses": None}
        self.events.append("decode")
        if self.failure == "decode":
            raise ValueError("decode failed")
        hyp = Hypothesis(score=-1.0, y_sequence=torch.tensor([1]), text="認識")
        return [[hyp, hyp]] if self.nbest else [hyp]

    def change_decoding_strategy(self, config, **_kwargs):
        self.cfg.decoding = config


def recognizer(monkeypatch, **kwargs):
    obj = object.__new__(SpeechRecognizerNemo)
    obj.model = Model(**kwargs)
    obj.transcribe_config = TranscribeConfig(verbose=False, raw_hypothesis=True)
    obj.default_decoding_config = obj.model.cfg.decoding
    module = import_module(
        "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemo"
    )
    monkeypatch.setattr(
        module, "decode_hypothesis", lambda model, hyp: SimpleNamespace(text=hyp.text)
    )
    return obj


@pytest.mark.parametrize("nbest", [False, True])
def test_preprocessing_and_candidates(monkeypatch, nbest):
    obj = recognizer(monkeypatch, nbest=nbest)
    audio = np.arange(16, dtype=np.int16)
    result = obj.transcribe_with_score(audio)
    assert result == [("認識", -1.0)] * (2 if nbest else 1)
    np.testing.assert_array_equal(obj.model.input.numpy()[0], np.pad(audio, 8000))
    assert obj.model.input.dtype == torch.int16
    assert obj.model.events == ["begin", "encode", "end", "begin", "decode", "end"]
    assert not obj.model.active


@pytest.mark.parametrize("failure", ["encode", "decode"])
def test_failure_restores_inference_and_strategy(monkeypatch, failure):
    obj = recognizer(monkeypatch, failure=failure)
    monkeypatch.setattr(
        obj,
        "build_decoding_config",
        lambda **kwargs: OmegaConf.create({"strategy": "temporary"}),
    )
    with pytest.raises(ValueError, match=failure):
        obj.transcribe_candidates(np.zeros(16, dtype=np.int16))
    assert not obj.model.active
    assert obj.model.cfg.decoding.strategy == "original"
