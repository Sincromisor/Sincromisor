"""外部サービスを使わず、生成結果の口形列と前後の無音時間を確認する。"""

import io
import wave

import pytest
from sincro_models import VoiceSynthesizerRequest, VoiceVoxQuery
from voice_synthesizer.mora_timing import build_mora_queue
from voice_synthesizer.VoiceSynthesizer.VoiceSynthesizer import VoiceSynthesizer


def make_query(*, empty=False):
    def mora(text, vowel, vowel_length, consonant_length=None):
        return {
            "text": text,
            "consonant": "k" if consonant_length else None,
            "consonant_length": consonant_length,
            "vowel": vowel,
            "vowel_length": vowel_length,
            "pitch": 0,
        }

    return VoiceVoxQuery.model_validate(
        {
            "accent_phrases": []
            if empty
            else [
                {
                    "moras": [
                        mora("カ", "a", 0.2, 0.05),
                        mora("ア", "a", 0.15),
                        mora("ク", "U", 0, 0.04),
                    ],
                    "accent": 1,
                    "pause_mora": mora("、", "pau", 0.5, 0.02),
                    "is_interrogative": False,
                },
                {
                    "moras": [mora("オ", "o", 0.3)],
                    "accent": 1,
                    "pause_mora": None,
                    "is_interrogative": False,
                },
            ],
            "speedScale": 1,
            "pitchScale": 0,
            "intonationScale": 1,
            "volumeScale": 1,
            "prePhonemeLength": 0.1,
            "postPhonemeLength": 0.1,
            "pauseLength": None,
            "pauseLengthScale": 1,
            "outputSamplingRate": 24000,
            "outputStereo": False,
            "kana": "",
        }
    )


@pytest.mark.parametrize("empty", [False, True])
def test_generate_preserves_moras_and_distinct_silences(monkeypatch, empty):
    query = make_query(empty=empty)
    wav = io.BytesIO()
    with wave.open(wav, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(b"\0\0" * 48000)

    synthesizer = VoiceSynthesizer()
    monkeypatch.setattr(synthesizer, "audio_query", lambda **kwargs: query)
    received = []

    def synthesize(filtered_query, *, style_id):
        received.append((filtered_query.model_copy(deep=True), style_id))
        return wav.getvalue()

    monkeypatch.setattr(synthesizer, "query_synthesis", synthesize)
    try:
        result = synthesizer.generate(
            VoiceSynthesizerRequest(
                speech_id=1,
                message="人工テスト",
                style_id=3,
                pre_phoneme_length=0.2,
                post_phoneme_length=0.4,
            )
        )
    finally:
        synthesizer.close()

    assert received == [(result.query, 3)]
    assert result.voice == wav.getvalue()
    assert result.audio_format == "audio/wav"
    assert result.speaking_time == 2
    assert [(m.vowel, m.text) for m in result.mora_queue] == (
        [(None, None), (None, None)]
        if empty
        else [
            (None, None),
            ("a", "カ"),
            ("a", "ア"),
            (None, "ク"),
            (None, None),
            ("o", "オ"),
            (None, None),
        ]
    )
    assert [m.length for m in result.mora_queue] == pytest.approx(
        [0.2, 0.4] if empty else [0.2, 0.25, 0.15, 0.04, 0.12, 0.3, 0.4]
    )


def test_conversion_preserves_query_and_returns_independent_moras():
    query = make_query()
    original = query.model_copy(deep=True)
    result = build_mora_queue(query)
    assert query == original
    assert result[4].length == pytest.approx(0.52)
    result[1].length = 9
    result[1].text = "変更済み"
    assert query == original
    assert build_mora_queue(query)[1].length == pytest.approx(0.25)
