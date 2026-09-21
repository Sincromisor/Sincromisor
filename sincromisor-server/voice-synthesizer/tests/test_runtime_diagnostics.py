"""実コマンド失敗と保存境界を人工データで確認し、本文・キーが診断へ流れないことを検証する。"""

import io
import json
import logging
import subprocess
from types import SimpleNamespace

import msgpack
import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from botocore.response import StreamingBody
from redis.exceptions import ConnectionError as RedisConnectionError
from sincro_config.SincromisorLoggerConfig import JsonLogFormatter
from sincro_models import SpeechExtractorResult, VoiceSynthesizerRequest
from voice_synthesizer.VoiceSynthesizer import VoiceCacheManager
from voice_synthesizer.VoiceSynthesizer.VoiceSynthesizer import VoiceSynthesizer


def test_encoder_failure_and_missing_command(tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    for name in ("opusenc", "fdkaac"):
        command = tmp_path / name
        command.write_text(
            "#!/bin/sh\nprintf 'Invalid input Bearer private-encoder-token text=private-body\\n' >&2\n/usr/bin/head -c 70000 /dev/zero >&2\nexit 7\n"
        )
        command.chmod(0o700)
    monkeypatch.setenv("PATH", str(tmp_path))
    result = SpeechExtractorResult(session_id="session-a", speech_id=9, start_at=0)
    calls = [
        result.to_opus,
        lambda: VoiceSynthesizer().encode(b"private-audio", "audio/aac", speech_id=9),
        lambda: VoiceSynthesizer().encode(
            b"private-audio", "audio/ogg;codecs=opus", speech_id=9
        ),
    ]
    for call in calls:
        with pytest.raises(subprocess.CalledProcessError):
            call()
    for path in tmp_path.iterdir():
        path.unlink()
    with pytest.raises(FileNotFoundError):
        result.to_opus()
    rows = [
        json.loads(JsonLogFormatter().format(record))
        for record in caplog.records
        if record.name == "sincro.audio_encoder"
    ]
    assert len(rows) == 4
    assert all(
        row["exit_code"] == 7
        and row["stderr_truncated"]
        and row["stderr_diagnostic"] == "invalid input"
        for row in rows[:3]
    )
    assert rows[-1]["reason"] == "not_found"
    assert rows[-1]["exit_code"] == -1
    assert not any("private-" in json.dumps(row) for row in rows)


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (
            ClientError(
                {"Error": {"Code": "NoSuchKey", "Message": "private-key"}}, "GetObject"
            ),
            "not_found",
        ),
        (
            ClientError(
                {
                    "Error": {"Code": "AccessDenied", "Message": "private-token"},
                    "ResponseMetadata": {"HTTPStatusCode": 403},
                },
                "GetObject",
            ),
            "permission_denied",
        ),
        (
            EndpointConnectionError(endpoint_url="http://private-token"),
            "connection_failed",
        ),
    ],
)
def test_s3_read_fallback_is_classified(error, reason, caplog):
    caplog.set_level(logging.INFO)
    manager = object.__new__(VoiceCacheManager)
    manager.logger = logging.getLogger("sincro.test_cache")

    def fail(**kwargs):
        raise error

    manager.s3_client = SimpleNamespace(get_object=fail, put_object=fail)
    manager.bucket_name = "private-bucket"
    request = VoiceSynthesizerRequest(message="private-body", speech_id=8, style_id=3)
    ids = {"session_id": "session-a", "speech_id": 8}
    assert manager._VoiceCacheManager__get_voice_s3(request, ids) is None  # noqa: SLF001 - 保存境界の代替動作を直接検証する。
    row = json.loads(JsonLogFormatter().format(caplog.records[-1]))
    assert row["peer"] == "s3"
    assert row["reason"] == reason
    assert row["outcome"] == ("miss" if reason == "not_found" else "failed")
    assert "private-" not in json.dumps(row)
    manager._VoiceCacheManager__put_voice_s3(  # noqa: SLF001 - 保存失敗の継続を直接検証する。
        request, SimpleNamespace(to_msgpack=lambda: b"private-audio"), ids
    )
    row = json.loads(JsonLogFormatter().format(caplog.records[-1]))
    assert row["stage"] == "write"
    assert row["outcome"] == "failed"
    assert row["reason"] == reason
    assert "private-" not in json.dumps(row)


def test_corrupt_cache_and_redis_connection(caplog):
    caplog.set_level(logging.INFO)
    manager = object.__new__(VoiceCacheManager)
    manager.logger = logging.getLogger("sincro.test_cache")
    request = VoiceSynthesizerRequest(message="private-body", speech_id=8, style_id=3)
    ids = {"session_id": "session-a", "speech_id": 8}
    for peer in ("redis", "s3"):
        manager.redis = SimpleNamespace(get=lambda key: b"private-corrupt")
        manager.s3_client = SimpleNamespace(
            get_object=lambda **kwargs: {
                "Body": StreamingBody(io.BytesIO(b"private-corrupt"), 15)
            }
        )
        manager.bucket_name = "private-bucket"
        with pytest.raises(msgpack.ExtraData):
            getattr(manager, f"_VoiceCacheManager__get_voice_{peer}")(request, ids)
        assert caplog.records[-1].msg["stage"] == "decode"
        assert caplog.records[-1].msg["outcome"] == "failed"

    def fail(*args, **kwargs):
        raise RedisConnectionError("private-key")

    manager.redis = SimpleNamespace(get=fail, set=fail)
    with pytest.raises(RedisConnectionError):
        manager._VoiceCacheManager__get_voice_redis(request, ids)  # noqa: SLF001 - 読取失敗の伝播を検証する。
    assert caplog.records[-1].msg["reason"] == "connection_failed"
    # 書込失敗は生成結果を返す既存動作を維持する。
    manager._VoiceCacheManager__put_voice_redis(  # noqa: SLF001 - 書込失敗時の継続を検証する。
        request, SimpleNamespace(to_msgpack=lambda: b"private-audio"), ids
    )
    assert caplog.records[-1].msg["stage"] == "write"
    assert all(
        "private-" not in JsonLogFormatter().format(record)
        for record in caplog.records
        if record.name == manager.logger.name
    )
