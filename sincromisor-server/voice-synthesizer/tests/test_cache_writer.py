"""遅い保存・予約上限・取消・終了と、完成後だけの独立保存を確認する。"""

import io
import logging
from importlib import import_module
from threading import Event, Thread
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult
from test_cache_promotion import cache_result
from test_streaming_audio import query, wav_bytes
from voice_synthesizer.cache_writer import VoiceCacheWriter
from voice_synthesizer.voice_stream import StreamContext, stream_voice
from voice_synthesizer.VoiceSynthesizer import VoiceCacheManager


def make_writer(monkeypatch, redis=None, s3=None):
    module = import_module("voice_synthesizer.cache_writer")
    redis = redis or Mock()
    s3 = s3 or Mock()
    monkeypatch.setattr(module, "Redis", Mock(return_value=redis))
    monkeypatch.setattr(module.boto3, "client", Mock(return_value=s3))
    return VoiceCacheWriter("unused", 1, "unused", 1, "fixture", "fixture"), redis, s3


def request():
    return VoiceSynthesizerRequest(message="人工音声", speech_id=8, style_id=3)


@pytest.mark.parametrize("slow_peer", ["redis", "s3"])
def test_slow_storage_does_not_delay_final_or_next_request_and_drains(
    monkeypatch, slow_peer
):
    started, release = Event(), Event()
    saved = []

    def write(key, value, *, ex):
        if slow_peer == "redis":
            started.set()
            assert release.wait(3)
        saved.append((key, value, ex))

    def s3_write(**kwargs):
        if slow_peer == "s3":
            started.set()
            assert release.wait(3)

    writer, redis, s3 = make_writer(
        monkeypatch,
        redis=Mock(set=Mock(side_effect=write)),
        s3=Mock(put_object=Mock(side_effect=s3_write)),
    )
    manager = object.__new__(VoiceCacheManager)
    manager.cache_writer = writer
    manager.load_cached_voice = Mock(return_value=None)
    manager.vsynth = SimpleNamespace(
        generate_pcm=lambda *args: ((query(), pcm) for pcm in [b"\1\0" * 240])
    )
    context = StreamContext(1, Event(), {"speech_id": 8})
    first_request = request()
    closer = Thread(target=writer.close)
    try:
        first = list(stream_voice(manager, first_request, context))
        assert first[-1].final
        assert started.wait(1)
        second_context = StreamContext(2, Event(), {"speech_id": 9})
        second = list(stream_voice(manager, request(), second_context))
        assert second[-1].final
        assert not release.is_set()
        # 受理済みコピーは元DTOの更新や接続終了から独立する。
        first_request.message = "変更後"
        context.result.query.speedScale = 2
        second_context.result.voice = b"changed"
        second_context.result.query.speedScale = 2
        context.cancelled.set()
        second_context.cancelled.set()
        closer.start()
        assert closer.is_alive()
        redis.close.assert_not_called()
        s3.close.assert_not_called()
    finally:
        release.set()
        if closer.ident is not None:
            closer.join(3)
        writer.close()
    assert not closer.is_alive()
    assert len(saved) == 2
    for _, payload, expires in saved:
        result = VoiceSynthesizerResult.from_msgpack(payload)
        assert result.message == "人工音声"
        assert result.query.speedScale == 1
        assert result.voice == wav_bytes(b"\1\0" * 240)
        assert expires == 60 * 60 * 24 * 7
    assert s3.put_object.call_count == 2
    redis.close.assert_called_once()
    s3.close.assert_called_once()


@pytest.mark.parametrize("limit", ["jobs", "bytes"])
def test_full_queue_skips_before_copy_or_serialization(monkeypatch, caplog, limit):
    caplog.set_level(logging.INFO)
    module = import_module("voice_synthesizer.cache_writer")
    started, release = Event(), Event()

    def write(*args, **kwargs):
        started.set()
        assert release.wait(3)

    writer, _, _ = make_writer(monkeypatch, redis=Mock(set=write))
    context = StreamContext(1, Event(), {})
    result = cache_result()
    try:
        assert writer.submit(request(), result, context)
        assert started.wait(1)
        if limit == "jobs":
            monkeypatch.setattr(module, "MAX_WRITE_JOBS", 1)
        else:
            monkeypatch.setattr(module, "MAX_WRITE_BYTES", 1)
        copy = Mock(side_effect=AssertionError("must not copy"))
        monkeypatch.setattr(VoiceSynthesizerResult, "model_copy", copy)
        assert not writer.submit(request(), result, context)
        copy.assert_not_called()
        assert caplog.records[-1].msg["reason"] == "queue_full"
    finally:
        release.set()
        writer.close()


@pytest.mark.parametrize("outcome", ["cancel_before", "cancel_copy", "copy_failure"])
def test_unaccepted_cancel_or_copy_failure_releases_reservation(
    monkeypatch, caplog, outcome
):
    caplog.set_level(logging.INFO)
    writer, redis, s3 = make_writer(monkeypatch)
    result = cache_result()
    context = StreamContext(1, Event(), {})
    original_copy = VoiceSynthesizerResult.model_copy

    def copy(self, **kwargs):
        if outcome == "copy_failure":
            raise ValueError("private-copy-body")
        context.cancelled.set()
        return original_copy(self, **kwargs)

    try:
        if outcome == "cancel_before":
            context.cancelled.set()
        else:
            monkeypatch.setattr(VoiceSynthesizerResult, "model_copy", copy)
        assert not writer.submit(request(), result, context)
        # 回収が完了すれば、同じ上限で後続要求も予約できる。
        monkeypatch.setattr(VoiceSynthesizerResult, "model_copy", original_copy)
        assert writer.submit(request(), result, StreamContext(2, Event(), {}))
    finally:
        writer.close()
    assert redis.set.call_count == 1
    assert s3.put_object.call_count == 1
    assert "private-copy-body" not in str([r.msg for r in caplog.records])


def test_storage_failure_does_not_break_other_destination_or_following_job(
    monkeypatch, caplog
):
    caplog.set_level(logging.INFO)
    writer, redis, s3 = make_writer(
        monkeypatch, redis=Mock(set=Mock(side_effect=ValueError("private-key")))
    )
    try:
        for number in range(2):
            assert writer.submit(
                request(), cache_result(), StreamContext(number, Event(), {})
            )
    finally:
        writer.close()
    assert redis.set.call_count == 2
    assert s3.put_object.call_count == 2
    rows = [r.msg for r in caplog.records if isinstance(r.msg, dict)]
    assert (
        len([r for r in rows if r["stage"] == "write" and r["outcome"] == "failed"])
        == 2
    )
    assert "private-key" not in str(rows)
    assert not writer.submit(request(), cache_result(), StreamContext(3, Event(), {}))
    assert caplog.records[-1].msg["reason"] == "shutdown"


@pytest.mark.parametrize("outcome", ["complete", "cancel", "truncated"])
def test_s3_promotion_waits_for_validated_wav(monkeypatch, outcome):
    from botocore.response import StreamingBody

    result = cache_result()
    result.voice = wav_bytes(b"\1\0" * 5000)
    if outcome == "truncated":
        result.voice = result.voice[:-2]
    payload = result.to_msgpack()
    writer, redis, s3 = make_writer(monkeypatch)
    manager = object.__new__(VoiceCacheManager)
    manager.logger = logging.getLogger("sincro.cache-promotion-test")
    manager.cache_writer = writer
    manager.bucket_name = "voice-synthesizer"
    manager.redis = Mock(get=Mock(return_value=None))
    manager.s3_client = Mock(
        get_object=Mock(
            return_value={"Body": StreamingBody(io.BytesIO(payload), len(payload))}
        )
    )
    context = StreamContext(1, Event(), {})
    iterator = stream_voice(manager, request(), context)
    try:
        assert not next(iterator).final
        redis.set.assert_not_called()
        if outcome == "cancel":
            context.cancelled.set()
        if outcome == "complete":
            assert list(iterator)[-1].final
        else:
            with pytest.raises(InterruptedError if outcome == "cancel" else ValueError):
                list(iterator)
    finally:
        iterator.close()
        writer.close()
    assert redis.set.call_count == int(outcome == "complete")
    s3.put_object.assert_not_called()


def test_process_shares_writer_and_closes_it_after_connections(monkeypatch):
    import asyncio
    import logging.config
    import runpy
    from pathlib import Path

    import sincro_config
    import uvicorn
    from starlette.websockets import WebSocketState
    from voice_synthesizer.models import VoiceSynthesizerProcessArgument

    settings = VoiceSynthesizerProcessArgument(
        log_file="/tmp/synthesis-cache-test.log",
        host="127.0.0.1",
        port=1,
        public_bind_host="127.0.0.1",
        public_bind_port=1,
        voicevox_default_style_id=0,
        consul_agent_host="unused",
        consul_agent_port=1,
        s3_access_key="fixture",
        s3_secret_key="fixture",
    )
    monkeypatch.setattr(VoiceSynthesizerProcessArgument, "argparse", lambda: settings)
    monkeypatch.setattr(logging.config, "dictConfig", lambda _: None)
    descriptions = SimpleNamespace(service_address="unused", service_port=1)
    monkeypatch.setattr(
        sincro_config,
        "ServiceDiscoveryReferrer",
        lambda **_: SimpleNamespace(get_random_worker=lambda **_: descriptions),
    )
    monkeypatch.setattr(
        sincro_config,
        "ServiceDiscoveryReporter",
        lambda **_: SimpleNamespace(start=lambda: None),
    )
    namespace = runpy.run_path(
        str(Path(__file__).parents[1] / "VoiceSynthesizerProcess.py")
    )
    calls = []
    writer = SimpleNamespace(close=lambda: calls.append("writer_close"))
    create_writer = Mock(return_value=writer)
    # run_pathの関数は独立したglobals辞書を持つため、実際のstartの参照先を置き換える。
    process_class = namespace["VoiceSynthesizerProcess"]
    environment = process_class.start.__globals__
    monkeypatch.setitem(environment, "VoiceCacheWriter", create_writer)

    async def communicate(ws, diagnostic):
        calls.append("communicate")

    def worker(**kwargs):
        assert kwargs["cache_writer"] is writer
        return SimpleNamespace(
            communicate=communicate, close=lambda: calls.append("worker_close")
        )

    monkeypatch.setitem(environment, "VoiceSynthesizerWorker", worker)

    def run(app, **_kwargs):
        async def serve():
            endpoint = next(
                route.endpoint
                for route in app.routes
                if route.path.endswith("/synthesize")
            )
            async with app.router.lifespan_context(app):
                for _ in range(2):

                    async def accept():
                        pass

                    await endpoint(
                        SimpleNamespace(
                            accept=accept, client_state=WebSocketState.DISCONNECTED
                        )
                    )
                assert calls == [
                    "communicate",
                    "worker_close",
                    "communicate",
                    "worker_close",
                ]
            assert calls[-1] == "writer_close"

        asyncio.run(serve())

    monkeypatch.setattr(uvicorn, "run", run)
    process_class(settings).start()
    create_writer.assert_called_once()


def test_shutdown_and_limit_include_copy_reservation(monkeypatch):
    module = import_module("voice_synthesizer.cache_writer")
    monkeypatch.setattr(module, "MAX_WRITE_JOBS", 1)
    copying, release = Event(), Event()
    original_copy = VoiceSynthesizerResult.model_copy

    def copy(self, **kwargs):
        copying.set()
        assert release.wait(3)
        return original_copy(self, **kwargs)

    monkeypatch.setattr(VoiceSynthesizerResult, "model_copy", copy)
    writer, redis, s3 = make_writer(monkeypatch)
    accepted = []
    submitter = Thread(
        target=lambda: accepted.append(
            writer.submit(request(), cache_result(), StreamContext(1, Event(), {}))
        )
    )
    closer = Thread(target=writer.close)
    try:
        submitter.start()
        assert copying.wait(1)
        assert not writer.submit(
            request(), cache_result(), StreamContext(2, Event(), {})
        )
        closer.start()
        assert closer.is_alive()
        redis.close.assert_not_called()
        s3.close.assert_not_called()
    finally:
        release.set()
        submitter.join(3)
        if closer.ident is not None:
            closer.join(3)
        writer.close()
    assert accepted == [True]
    assert not closer.is_alive()
    redis.set.assert_called_once()
    s3.put_object.assert_called_once()
