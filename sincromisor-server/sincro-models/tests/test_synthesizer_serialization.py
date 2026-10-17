"""既存固定データの音声・入れ子値と、省略・不正入力時の検証を確認する。"""

import json
from pathlib import Path

import msgpack
import pytest
from pydantic import ValidationError
from sincro_models import VoiceSynthesizerResult

FIXTURE = (
    Path(__file__).parents[2]
    / "sincro-rtc/internal/pipeline/protocol/testdata/voice_synthesizer_result.msgpack"
)


def test_existing_payload_and_json_values():
    before = msgpack.unpackb(FIXTURE.read_bytes())
    model = VoiceSynthesizerResult.from_msgpack(FIXTURE.read_bytes())
    assert msgpack.unpackb(model.to_msgpack()) == before
    assert isinstance(model.voice, bytes)
    assert json.loads(model.to_json()) == {
        key: value for key, value in before.items() if key != "voice"
    }
    before.pop("speech_id")
    assert VoiceSynthesizerResult.from_msgpack(msgpack.packb(before)).speech_id == -1


@pytest.mark.parametrize(
    "field",
    ["message", "query", "mora_queue", "speaking_time", "voice", "audio_format"],
)
def test_required_fields(field):
    content = msgpack.unpackb(FIXTURE.read_bytes())
    content.pop(field)
    with pytest.raises(ValidationError):
        VoiceSynthesizerResult.from_msgpack(msgpack.packb(content))


def test_invalid_nested_mora():
    content = msgpack.unpackb(FIXTURE.read_bytes())
    content["mora_queue"] = [{"length": "invalid"}]
    with pytest.raises(ValidationError):
        VoiceSynthesizerResult.from_msgpack(msgpack.packb(content))
