"""Engineと同じ音素単位の量子化、速度・休止・疑問文補正を確認する。"""

import pytest
from sincro_models import VoiceVoxAccentPhrase, VoiceVoxMora
from test_streaming_audio import query
from voice_synthesizer.streaming_mora_timing import build_streaming_mora_queue


def test_quantize_each_phoneme_before_combining_and_do_not_mutate():
    value = query()
    value.prePhonemeLength = 2.5 / 93.75
    value.postPhonemeLength = 3.5 / 93.75
    value.accent_phrases = [
        VoiceVoxAccentPhrase(
            moras=[
                VoiceVoxMora(
                    text="ア",
                    consonant="k",
                    consonant_length=2.5 / 93.75,
                    vowel="a",
                    vowel_length=3.5 / 93.75,
                    pitch=4,
                )
            ],
            accent=1,
            pause_mora=None,
            is_interrogative=False,
        )
    ]
    before = value.model_copy(deep=True)
    result = build_streaming_mora_queue(value)
    assert [round(m.length * 48000) for m in result] == [1024, 3072, 2048]
    assert value == before


def test_speed_pause_and_interrogative_extend_same_mora():
    value = query()
    value.speedScale = 2
    value.pauseLength = 0.3
    value.pauseLengthScale = 0.5
    value.accent_phrases = [
        VoiceVoxAccentPhrase(
            moras=[
                VoiceVoxMora(
                    text="ア",
                    consonant=None,
                    consonant_length=None,
                    vowel="a",
                    vowel_length=0.1,
                    pitch=4,
                )
            ],
            accent=1,
            pause_mora=VoiceVoxMora(
                text="、",
                consonant=None,
                consonant_length=None,
                vowel="pau",
                vowel_length=0.8,
                pitch=0,
            ),
            is_interrogative=True,
        )
    ]
    result = build_streaming_mora_queue(value)
    assert [round(m.length * 48000) for m in result] == [2560, 6144, 3584, 2560]
    assert [m.text for m in result] == [None, "ア", None, None]
    assert [m.vowel for m in result] == [None, "a", None, None]


@pytest.mark.parametrize("speed", [0, -1, float("nan"), float("inf")])
def test_reject_invalid_query_speed(speed):
    value = query()
    value.speedScale = speed
    with pytest.raises(ValueError, match="speed"):
        build_streaming_mora_queue(value)
