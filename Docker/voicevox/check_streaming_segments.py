"""段階的な区間生成の波形連続性と入力検証。"""

import numpy as np
import pytest
from test.unit.tts_pipeline.test_tts_engine import _gen_hello_hiho_query
from voicevox_engine.dev.core.mock import MockCoreWrapper
from voicevox_engine.metas.metas import StyleId
from voicevox_engine.tts_pipeline.tts_engine import TalkInvalidInputError, TTSEngine


@pytest.mark.parametrize("start_offset", [0, 0.5])
@pytest.mark.parametrize(("sample_rate", "stereo"), [(24000, False), (48000, True)])
@pytest.mark.parametrize("speed", [0.3, 10])
def test_ramp_preserves_samples(
    start_offset: float, sample_rate: int, stereo: bool, speed: float
) -> None:
    query = _gen_hello_hiho_query()
    query.speedScale = speed
    query.outputSamplingRate = sample_rate
    query.outputStereo = stereo
    engine = TTSEngine(MockCoreWrapper())
    # 短い発話では途中開始を指定しない。
    offset = start_offset if speed < 1 else 0
    count, fixed = engine.synthesize_wave_stream(query, StyleId(1), offset, 0.3, True)
    ramp_count, ramp = engine.synthesize_wave_stream(
        query, StyleId(1), offset, 0.3, True, max_segment_length=2.4
    )
    fixed_wave = np.concatenate(list(fixed))
    ramp_chunks = list(ramp)
    ramp_wave = np.concatenate(ramp_chunks)
    assert count == ramp_count == len(fixed_wave) == len(ramp_wave)
    np.testing.assert_allclose(ramp_wave, fixed_wave, atol=1e-6)
    if speed < 1 and sample_rate == 24000:
        assert [len(chunk) // 256 for chunk in ramp_chunks[:5]] == [
            28,
            56,
            112,
            225,
            225,
        ]


@pytest.mark.parametrize("cap", [0.3, 0.8])
def test_ramp_stops_at_cap(cap: float) -> None:
    query = _gen_hello_hiho_query()
    query.speedScale = 0.3
    query.outputSamplingRate = 24000
    engine = TTSEngine(MockCoreWrapper())
    count, stream = engine.synthesize_wave_stream(
        query, StyleId(1), 0, 0.3, True, max_segment_length=cap
    )
    chunks = list(stream)
    frames = [len(chunk) // 256 for chunk in chunks]
    assert frames[:4] == ([28] * 4 if cap == 0.3 else [28, 56, 75, 75])
    assert sum(map(len, chunks)) == count


@pytest.mark.parametrize(
    ("segment", "cap"),
    [
        (0, None),
        (0.001, None),
        (-1, None),
        (float("inf"), None),
        (float("nan"), None),
        (0.3, 0.2),
        (0.3, float("inf")),
        (0.3, float("nan")),
    ],
)
def test_invalid_segments_rejected_before_streaming(
    segment: float, cap: float | None
) -> None:
    engine = TTSEngine(MockCoreWrapper())
    with pytest.raises(TalkInvalidInputError):
        engine.synthesize_wave_stream(
            _gen_hello_hiho_query(),
            StyleId(1),
            0,
            segment,
            True,
            max_segment_length=cap,
        )


@pytest.mark.parametrize(("segment", "expected_first"), [(0.3, 13280), (0.43, 19920)])
def test_first_segment_after_resampling(segment: float, expected_first: int) -> None:
    """採用再サンプラーの保持を含め、HTTP読取後の初期再生量を固定する。"""
    query = _gen_hello_hiho_query()
    query.speedScale = 0.3
    query.outputSamplingRate = 48000
    query.outputStereo = False
    engine = TTSEngine(MockCoreWrapper())
    count, stream = engine.synthesize_wave_stream(
        query, StyleId(1), 0, segment, True, max_segment_length=2.4
    )
    chunks = list(stream)
    assert len(chunks[0]) == expected_first
    assert sum(map(len, chunks)) == count
    # Content-Length応答の9600byte読取には44byteヘッダーも含まれる。
    reads = (44 + expected_first * 2) // 9600
    delivered_samples = ((reads * 9600 - 44) // 9600) * 4800
    assert delivered_samples == (4800 if segment == 0.3 else 14400)
