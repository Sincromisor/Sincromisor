"""逐次PCM契約の固定データと、暗黙変換・欠落・不正区間の拒否を確認する。"""

from pathlib import Path

import msgpack
import pytest
from pydantic import ValidationError
from sincro_models import VoiceSynthesizerChunk

FIXTURE = (
    Path(__file__).parents[2]
    / "sincro-rtc/internal/pipeline/protocol/testdata/voice_synthesizer_chunk.msgpack"
)


def test_fixture_roundtrip():
    chunk = VoiceSynthesizerChunk.from_msgpack(FIXTURE.read_bytes())
    assert chunk.request_id == 1
    assert chunk.speech_id == 42
    assert len(chunk.pcm) == 9600
    assert chunk.to_msgpack() == FIXTURE.read_bytes()


@pytest.mark.parametrize(
    "field",
    [
        "request_id",
        "speech_id",
        "sequence",
        "sample_offset",
        "final",
        "pcm",
        "message",
        "mora_queue",
    ],
)
def test_all_fields_required(field):
    content = msgpack.unpackb(FIXTURE.read_bytes())
    content.pop(field)
    with pytest.raises(ValidationError):
        VoiceSynthesizerChunk.from_msgpack(msgpack.packb(content))


@pytest.mark.parametrize(
    "updates",
    [
        {"request_id": True},
        {"request_id": "1"},
        {"request_id": 0},
        {"sequence": -1},
        {"pcm": "raw"},
        {"pcm": b"x"},
        {"pcm": b"xx" * 24001},
        {"sample_offset": 1},
        {"final": True},
        {"sequence": 1},
        {"extra": 1},
        {"sample_offset": 48_000 * 120 + 1},
    ],
)
def test_invalid_chunks(updates):
    content = msgpack.unpackb(FIXTURE.read_bytes())
    content.update(updates)
    with pytest.raises(ValidationError):
        VoiceSynthesizerChunk.from_msgpack(msgpack.packb(content))
