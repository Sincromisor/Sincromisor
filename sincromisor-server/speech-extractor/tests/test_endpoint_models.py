"""固定モデルの境界と実推論を確認する。人工入力の成功を発話品質とは扱わない。"""

import importlib.util
import os
from pathlib import Path

import numpy as np
import pytest
from speech_extractor.endpoint_models import EndpointModels, VadMemory
from speech_extractor.model_assets import MODELS, verified_model
from speech_extractor.whisper_features import compute_whisper_log_mel_features


def test_corrupt_model_is_rejected(tmp_path):
    name = next(iter(MODELS))
    (tmp_path / name).write_bytes(b"broken")
    with pytest.raises(ValueError, match="checksum"):
        verified_model(tmp_path, name)


def test_turn_preprocessing_keeps_end_and_left_pads():
    class Session:
        def run(self, names, feeds):
            self.features = feeds["input_features"].copy()
            return [np.array([[0.8]], np.float32)]

    model = object.__new__(EndpointModels)
    model.turn = Session()
    signal = np.arange(130000, dtype=np.int16)
    model.completion_probability(signal)
    expected = compute_whisper_log_mel_features(
        signal[-128000:].astype(np.float32) / 32768.0
    )
    np.testing.assert_array_equal(model.turn.features[0], expected)
    model.completion_probability(signal[:500])
    expected = compute_whisper_log_mel_features(
        np.pad(signal[:500].astype(np.float32) / 32768.0, (127500, 0))
    )
    np.testing.assert_array_equal(model.turn.features[0], expected)


def test_vad_state_is_not_shared_between_connections():
    class Session:
        def run(self, names, feeds):
            assert feeds["input"].shape == (1, 576)
            return [np.array([[0.8]], np.float32), feeds["state"] + 1]

    model = object.__new__(EndpointModels)
    model.vad = Session()
    first, second = VadMemory(), VadMemory()
    model.speech_probability(np.ones(512, np.int16), first)
    assert np.all(first.state == 1)
    assert np.all(second.state == 0)
    assert np.all(second.context == 0)


@pytest.mark.skipif(
    not os.environ.get("SINCRO_TEST_TURN_MODELS"), reason="実モデル配置時だけ実行"
)
def test_real_models_load_and_infer_without_network():
    model = EndpointModels(Path(os.environ["SINCRO_TEST_TURN_MODELS"]))
    for value in [np.zeros(512, np.int16), np.arange(512, dtype=np.int16)]:
        assert 0 <= model.speech_probability(value, VadMemory()) <= 1
        assert 0 <= model.completion_probability(value) <= 1


@pytest.mark.skipif(
    not os.environ.get("SINCRO_TEST_WHISPER_REFERENCE"),
    reason="固定した上流原本との比較時だけ実行",
)
def test_features_match_upstream_reference():
    spec = importlib.util.spec_from_file_location(
        "upstream_features", os.environ["SINCRO_TEST_WHISPER_REFERENCE"]
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for signal in [
        np.zeros(128000, np.float32),
        np.random.default_rng(12).normal(size=128000).astype(np.float32),
    ]:
        expected = module.compute_whisper_log_mel_features(signal)
        np.testing.assert_array_equal(
            compute_whisper_log_mel_features(signal), expected
        )
