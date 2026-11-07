"""終端評価の区間対応と未確定・欠落の扱いを人工データで確認する。音声品質の試験ではない。"""

import wave

import numpy as np
import pytest
from pydantic import ValidationError
from speech_extractor.evaluation_annotations import EvaluationAnnotations, load_audio
from speech_extractor.evaluation_metrics import Emission, EvaluationRun, summarize
from speech_extractor.evaluation_runners import run_legacy


def annotations():
    return EvaluationAnnotations.model_validate(
        {
            "recording_id": "artificial",
            "audio_sha256": "0" * 64,
            "turns": [
                {
                    "speech": [
                        {"start": 1000, "end": 3000},
                        {"start": 5000, "end": 7000},
                    ],
                    "endpoint_sample": 7000,
                }
            ],
        }
    )


def test_premature_pause_and_final_latency_are_separate():
    run = EvaluationRun(
        emissions=[Emission(1200, 4000, True), Emission(5000, 8600, True)]
    )
    report = summarize(run, annotations())
    turn = report["turns"][0]
    assert report["premature_confirmations"] == 1
    assert report["unconfirmed_turns"] == 0
    assert turn["incomplete_pause_confirmations"] == 1
    assert turn["endpoint_audio_latency_ms"] == 100
    assert turn["leading_missing_samples"] == 200
    assert turn["trailing_missing_samples"] == 0
    assert turn["missing_speech_samples"] == 200


def test_unconfirmed_turn_has_null_latency_and_unsent_tail_is_missing():
    run = EvaluationRun(emissions=[Emission(0, 6000, False)], processed_samples=6500)
    report = summarize(run, annotations())
    turn = report["turns"][0]
    assert report["unconfirmed_turns"] == 1
    assert turn["confirmed_sample"] is None
    assert turn["endpoint_audio_latency_ms"] is None
    assert turn["trailing_missing_samples"] == 1000
    assert turn["missing_speech_samples"] == 1000


def test_overlapping_sent_intervals_are_counted_once():
    run = EvaluationRun(
        emissions=[Emission(0, 5500, False), Emission(5000, 8000, True)]
    )
    assert summarize(run, annotations())["turns"][0]["missing_speech_samples"] == 0


@pytest.mark.parametrize(
    "change",
    [
        {"speech": [{"start": 3000, "end": 2000}], "endpoint_sample": 4000},
        {
            "speech": [{"start": 1000, "end": 3000}, {"start": 2000, "end": 4000}],
            "endpoint_sample": 4000,
        },
        {"speech": [{"start": 1000, "end": 3000}], "endpoint_sample": 2000},
    ],
)
def test_invalid_annotation_intervals_are_rejected(change):
    data = annotations().model_dump()
    data["turns"] = [change]
    with pytest.raises(ValidationError):
        EvaluationAnnotations.model_validate(data)


def test_wrong_recording_and_out_of_bounds_annotation_are_rejected():
    current = annotations()
    with pytest.raises(ValueError, match="checksum"):
        current.validate_audio(8000, "1" * 64)
    with pytest.raises(ValueError, match="length"):
        current.validate_audio(6000, "0" * 64)


def test_wav_input_checks_format_and_preserves_all_samples(tmp_path):
    path = tmp_path / "artificial.wav"
    pcm = np.arange(9876, dtype=np.int16)
    with wave.open(str(path), "wb") as target:
        target.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        target.writeframes(pcm.tobytes())
    actual, digest = load_audio(path)
    np.testing.assert_array_equal(actual, pcm)
    assert len(digest) == 64
    with wave.open(str(path), "wb") as target:
        target.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        target.writeframes(pcm.tobytes())
    with pytest.raises(ValueError, match="16kHz"):
        load_audio(path)


def test_legacy_keeps_pre_roll_pause_and_exact_confirmation_boundary():
    decisions = iter([False] * 3 + [True, False, True] + [False] * 5)
    pcm = np.arange(3200 * 11 + 17, dtype=np.int16)
    run = run_legacy(pcm, lambda _: next(decisions), 1000)
    assert [(item.start, item.end, item.confirmed) for item in run.emissions] == [
        (1600, 12800, False),
        (12800, 19200, False),
        (19200, 35200, True),
    ]
    assert run.processed_samples == 35200
    assert run.turn_inferences == 0


def test_smart_incomplete_pause_preserves_pcm_and_rechecks_after_resumption():
    from speech_extractor.evaluation_runners import run_smart

    class Models:
        def __init__(self):
            self.calls = 0

        def speech_probability(self, frame, _memory):
            return float(frame[0] != 0)

        def completion_probability(self, _audio):
            self.calls += 1
            return float(self.calls == 2)

    models = Models()
    frames = [1] * 10 + [0] * 22 + [1] * 5 + [0] * 25
    pcm = np.repeat(np.array(frames, dtype=np.int16), 512)
    run = run_smart(pcm, models, 600)
    assert models.calls == 2
    assert [item.end for item in run.emissions if item.confirmed] == [56 * 512]
    assert run.emissions[0].start == 0
    assert all(
        previous.end == current.start
        for previous, current in zip(run.emissions, run.emissions[1:])
    )


def test_smart_incomplete_turn_reaches_silence_limit_once():
    from speech_extractor.evaluation_runners import run_smart

    class Models:
        def speech_probability(self, frame, _memory):
            return float(frame[0] != 0)

        def completion_probability(self, _audio):
            return 0.0

    pcm = np.repeat(np.array([1] * 10 + [0] * 96, dtype=np.int16), 512)
    run = run_smart(pcm, Models(), 600)
    assert run.turn_inferences == 1
    assert [item.end for item in run.emissions if item.confirmed] == [104 * 512]


def test_noise_only_and_repeated_finals_are_reported_as_unexpected():
    noise_annotations = annotations().model_copy(update={"turns": []})
    run = EvaluationRun(emissions=[Emission(0, 8000, True)])
    assert summarize(run, noise_annotations)["unexpected_confirmations"] == 1
    repeated = EvaluationRun(
        emissions=[Emission(0, 8000, True), Emission(8000, 9000, True)]
    )
    assert summarize(repeated, annotations())["unexpected_confirmations"] == 1
