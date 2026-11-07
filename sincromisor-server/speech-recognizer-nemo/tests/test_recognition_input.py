"""入力形式・発話順序・有限バッファをモデルなしで検証する。"""

import numpy as np
import pytest
from speech_recognizer_nemo.recognition_input import RecognitionInput
from test_recognition_storage import request


@pytest.mark.parametrize(
    "updates",
    [
        {"voice_sampling_rate": 48000},
        {"voice_channels": 2},
        {"voice_sample_bytes": 4},
        {"voice_dtype": "float32"},
        {"voice": np.zeros(4, dtype=np.float32)},
        {"voice": np.zeros((2, 2), dtype=np.int16)},
        {"speech_id": -1},
        {"sequence_id": -1},
        {"session_id": ""},
        {"start_at": float("nan")},
        {"start_at": float("inf")},
        {"voice": np.empty(0, dtype=np.int16)},
    ],
)
def test_invalid_first_input_is_rejected(updates):
    buffer = RecognitionInput()
    with pytest.raises(
        ValueError, match="^(Recognizer requires|Invalid recognition|Recognition audio)"
    ):
        buffer.append(request().model_copy(update=updates))
    assert buffer.used == 0
    assert buffer.buffer.size == 0


@pytest.mark.parametrize(
    "updates",
    [
        {"session_id": "different"},
        {"sequence_id": 1},
        {"sequence_id": 0},
        {"speech_id": 2},
    ],
)
def test_invalid_followup_does_not_change_accumulation(updates):
    buffer = RecognitionInput()
    buffer.append(request(confirmed=False))
    followup = request(confirmed=False).model_copy(update={"sequence_id": 2, **updates})
    with pytest.raises(ValueError, match="^(Invalid recognition|New speech)"):
        buffer.append(followup)
    np.testing.assert_array_equal(
        buffer.buffer[: buffer.used], np.arange(4, dtype=np.int16)
    )


def test_bound_coalesced_sequence_confirmation_and_release(monkeypatch):
    monkeypatch.setattr(RecognitionInput, "MAX_SAMPLES", 9)
    buffer = RecognitionInput()
    buffer.append(request(confirmed=False))
    second = request(confirmed=False).model_copy(update={"sequence_id": 8})
    buffer.append(second)
    assert buffer.used == buffer.buffer.size == 8
    oversized = request().model_copy(update={"sequence_id": 9})
    with pytest.raises(ValueError, match="64 MiB"):
        buffer.append(oversized)
    assert buffer.used == 8
    final = request(size=1).model_copy(update={"sequence_id": 10})
    buffer.append(final)
    assert buffer.used == buffer.buffer.size == 9
    assert final.voice.flags.writeable
    buffer.release_confirmed()
    assert buffer.buffer.size == buffer.used == 0
    with pytest.raises(ValueError, match="Confirmed"):
        buffer.append(request().model_copy(update={"sequence_id": 11}))
    buffer.append(request(12))
    assert buffer.used == 4
    with pytest.raises(ValueError, match="New speech"):
        buffer.append(request().model_copy(update={"sequence_id": 13}))
