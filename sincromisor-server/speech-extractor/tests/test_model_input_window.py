"""採用実モデルの短入力受理と末尾ゼロ埋めを確認する。判定品質の試験とは分ける。"""

import os
from pathlib import Path

import numpy as np
import pytest
from mediapipe.tasks import python
from mediapipe.tasks.python import audio
from mediapipe.tasks.python.components import containers

pytestmark = pytest.mark.skipif(
    not os.environ.get("SINCRO_TEST_YAMNET"), reason="実モデル確認時だけ実行する"
)


@pytest.fixture(scope="module")
def classifier():
    model = Path(os.environ["SINCRO_TEST_YAMNET"])
    options = audio.AudioClassifierOptions(
        base_options=python.BaseOptions(model_asset_path=str(model)), max_results=1
    )
    with audio.AudioClassifier.create_from_options(options) as value:
        yield value


@pytest.mark.parametrize("samples", [1, 320, 3200, 3520, 15600])
def test_short_input_equals_explicit_zero_padding(classifier, samples):
    signal = np.random.default_rng(0).uniform(-0.2, 0.2, samples).astype(np.float32)
    short = classifier.classify(containers.AudioData.create_from_array(signal, 16000))
    padded = classifier.classify(
        containers.AudioData.create_from_array(
            np.pad(signal, (0, 15600 - samples)), 16000
        )
    )
    assert len(short) == 1
    assert short == padded
    assert short[0].timestamp_ms == 0


@pytest.mark.parametrize(
    ("samples", "timestamps"), [(15601, [0, 975]), (31200, [0, 975])]
)
def test_long_clip_is_split_into_model_windows(classifier, samples, timestamps):
    results = classifier.classify(
        containers.AudioData.create_from_array(
            np.zeros(samples, dtype=np.float32), 16000
        )
    )
    assert [result.timestamp_ms for result in results] == timestamps
