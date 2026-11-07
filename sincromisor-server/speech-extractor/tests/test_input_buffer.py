"""発話内の無音、先行音声、差分通番と終端候補の境界を確認する。"""

import numpy as np
import pytest
from speech_extractor.turn_state import TurnState


def frame(value):
    return np.full(512, value, np.int16)


@pytest.mark.parametrize("threshold", [600, 1000])
def test_candidate_is_not_early_and_only_once_per_pause(threshold):
    state = TurnState("a", threshold)
    state.feed(frame(1), 0.9)
    count = 0
    while state.silence < threshold * 16:
        assert state.candidate() is None
        state.feed(frame(0), 0.01)
        count += 1
    token, audio = state.candidate()
    assert count * 32 >= threshold
    assert (count - 1) * 32 < threshold
    assert state.candidate() is None
    assert audio.size == (count + 1) * 512
    assert state.accepts(token)
    state.feed(frame(2), 0.9)
    assert not state.accepts(token)
    for _ in range(count):
        state.feed(frame(0), 0.01)
    assert state.candidate()[0] != token
    state.finish()
    assert not state.accepts(token)


def test_exact_pcm_pre_roll_pauses_and_sequence():
    state = TurnState("a", 600)
    outputs = []
    frames = [frame(i) for i in range(50)]
    # 最初の20フレームは待機、その後に発話・短い間・発話・終端の無音。
    for index, pcm in enumerate(frames):
        output = state.feed(pcm, 0.9 if 20 <= index < 30 or 35 <= index < 40 else 0.01)
        if output is not None:
            outputs.append(output)
    outputs.append(state.finish())
    expected = np.concatenate(frames)[20 * 512 - 8000 :]
    np.testing.assert_array_equal(np.concatenate([o.voice for o in outputs]), expected)
    assert [o.sequence_id for o in outputs] == list(range(1, len(outputs) + 1))
    assert all(o.speech_id == 0 for o in outputs)
    assert all(not o.confirmed for o in outputs[:-1])
    assert outputs[-1].confirmed
    assert len({o.start_at for o in outputs}) == 1
    state.feed(frame(7), 0.9)
    state.feed(frame(0), 0.01)
    second = state.finish()
    assert second.speech_id == 1
    assert second.sequence_id == outputs[-1].sequence_id + 1
    np.testing.assert_array_equal(second.voice, np.concatenate([frame(7), frame(0)]))


def test_history_is_last_eight_seconds_without_gaps():
    state = TurnState("a", 600)
    for i in range(300):
        state.feed(frame(i), 0.9)
    for _ in range(19):
        state.feed(frame(-1), 0)
    _, history = state.candidate()
    assert history.size == 128000
    expected = np.concatenate([frame(i) for i in range(300)] + [frame(-1)] * 19)
    np.testing.assert_array_equal(history, expected[-128000:])


@pytest.mark.parametrize("threshold", [0, -1, 3001])
def test_invalid_wait_is_rejected(threshold):
    with pytest.raises(ValueError, match="max_silence_ms"):
        TurnState("a", threshold)
