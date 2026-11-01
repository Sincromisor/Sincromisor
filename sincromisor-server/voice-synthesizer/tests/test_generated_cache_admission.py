"""保存枠の予約前に完成WAVを作らず、満杯時も配信・診断を維持することを確認する。"""

import logging
from importlib import import_module
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from test_cache_promotion import cache_result
from test_cache_writer import make_writer, request
from test_streaming_audio import query
from voice_synthesizer.voice_stream import StreamContext
from voice_synthesizer.VoiceSynthesizer import VoiceCacheManager


@pytest.mark.parametrize("limit", ["jobs", "bytes"])
def test_generated_full_queue_skips_wav_factory_and_preserves_success_log(
    monkeypatch, caplog, limit
):
    caplog.set_level(logging.INFO)
    module = import_module("voice_synthesizer.cache_writer")
    started, release = Event(), Event()

    def write(*_args, **_kwargs):
        started.set()
        assert release.wait(3)

    writer, _, _ = make_writer(monkeypatch, redis=Mock(set=write))
    manager = object.__new__(VoiceCacheManager)
    manager.logger = logging.getLogger("sincro.generated-cache-test")
    manager.log_synthesis = True
    manager.cache_writer = writer
    manager.load_cached_voice = Mock(return_value=None)
    manager.vsynth = SimpleNamespace(
        generate_pcm=lambda *_args: ((query(), pcm) for pcm in [b"\1\0" * 240])
    )
    factory = Mock(side_effect=AssertionError("must not build WAV"))
    context = StreamContext(1, Event(), {})
    try:
        assert writer.submit(request(), cache_result(), context)
        assert started.wait(1)
        if limit == "jobs":
            monkeypatch.setattr(module, "MAX_WRITE_JOBS", 1)
        else:
            monkeypatch.setattr(module, "MAX_WRITE_BYTES", 1)
        monkeypatch.setattr(module, "_complete_result", factory)
        chunks = list(manager.stream_voice(request(), context))
        assert chunks[-1].final
        assert b"".join(chunk.pcm for chunk in chunks) == b"\1\0" * 240
        factory.assert_not_called()
        assert context.result is None
        rows = [record.msg for record in caplog.records if isinstance(record.msg, dict)]
        assert any(row.get("reason") == "queue_full" for row in rows)
        result_log = next(row for row in rows if row.get("event") == "synthesis_result")
        assert result_log["speaking_time"] == 0.005
        assert result_log["audio_format"] == "audio/wav"
        assert result_log["parameters"]["speedScale"] == 1
    finally:
        release.set()
        writer.close()


@pytest.mark.parametrize("outcome", ["factory_failure", "cancel_factory"])
def test_generated_factory_failure_and_cancel_release_reservation(monkeypatch, outcome):
    module = import_module("voice_synthesizer.cache_writer")
    original_factory = module._complete_result  # noqa: SLF001  # reason: 予約後のfactory失敗と取消を同じ境界で再現する。
    writer, redis, s3 = make_writer(monkeypatch)
    context = StreamContext(1, Event(), {})

    def factory(*args):
        if outcome == "factory_failure":
            raise ValueError("private-factory-body")
        context.cancelled.set()
        return original_factory(*args)

    monkeypatch.setattr(module, "_complete_result", factory)
    try:
        assert not writer.submit_generated(
            request(), query(), bytearray(b"\1\0" * 240), context
        )
        monkeypatch.setattr(module, "_complete_result", original_factory)
        assert writer.submit_generated(
            request(), query(), bytearray(b"\1\0" * 240), StreamContext(2, Event(), {})
        )
    finally:
        writer.close()
    redis.set.assert_called_once()
    s3.put_object.assert_called_once()
