"""同期合成の回収と接続資源の解放順を、イベントと実WebSocketで確認する。"""

import asyncio
import io
import logging
import wave
from importlib import import_module
from threading import Event, get_ident
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from aiohttp import ClientSession, web
from botocore.exceptions import ClientError
from sincro_models import (
    ChatHistory,
    ChatMessage,
    TextProcessorRequest,
    TextProcessorResult,
    VoiceSynthesizerChunk,
)
from voice_synthesizer.VoiceSynthesizer import VoiceCacheManager, VoiceSynthesizerWorker


def request_pack():
    request = TextProcessorRequest(
        session_id="fixture",
        sequence_id=2,
        history=ChatHistory(),
        request_message=ChatMessage(
            speech_id=8, message_type="user", speaker_id="u", speaker_name="u"
        ),
    )
    result = TextProcessorResult.from_request(request, "assistant", "a", "a")
    result.append_response_message("人工音声")
    return result.to_msgpack()


@pytest.mark.parametrize(
    "outcome", ["success", "failure", "cancel", "send_failure", "send_cancel"]
)
def test_wait_does_not_block_and_cancel_joins(monkeypatch, caplog, outcome):
    monkeypatch.setenv("SINCRO_LOG_SYNTHESIS_ENABLED", "false")
    caplog.set_level(logging.INFO)

    async def run():
        loop = asyncio.get_running_loop()
        started = asyncio.Event()
        release = Event()
        calls = []
        sent = []
        closed = []
        voice = VoiceSynthesizerChunk(
            request_id=1,
            speech_id=8,
            sequence=0,
            sample_offset=0,
            final=False,
            pcm=b"\0\1",
            message="人工音声",
            mora_queue=[],
        )

        def stream_voice(request, context):
            calls.append(get_ident())
            loop.call_soon_threadsafe(started.set)
            assert release.wait(5)
            assert not closed
            if outcome == "failure":
                raise ValueError("generation failed")
            yield voice

        module = import_module(
            "voice_synthesizer.VoiceSynthesizer.VoiceSynthesizerWorker"
        )
        monkeypatch.setattr(
            module,
            "VoiceCacheManager",
            lambda **kwargs: SimpleNamespace(
                stream_voice=stream_voice, close=lambda: closed.append(True)
            ),
        )
        worker = VoiceSynthesizerWorker(
            "unused", 1, 3, "unused", 1, "unused", 1, "fixture", "fixture"
        )
        packs = [request_pack(), b""]

        async def receive_bytes():
            return packs.pop(0)

        async def send_bytes(pack):
            if outcome == "send_failure":
                raise ConnectionError("private-send-error")
            if outcome == "send_cancel":
                raise asyncio.CancelledError
            sent.append(pack)

        async def connection():
            try:
                await worker.communicate(
                    SimpleNamespace(receive_bytes=receive_bytes, send_bytes=send_bytes)
                )
            finally:
                worker.close()

        task = asyncio.create_task(connection())
        try:
            await asyncio.wait_for(started.wait(), 2)
            assert calls == [calls[0]]
            assert calls[0] != get_ident()
            assert not closed
            if outcome == "cancel":
                task.cancel()
                await asyncio.sleep(0)
                task.cancel()
                await asyncio.sleep(0)
                assert not task.done()
                assert not closed
            release.set()
            if outcome == "success":
                await task
                assert sent == [voice.to_msgpack()]
                assert voice.speech_id == 8
            else:
                with pytest.raises(
                    asyncio.CancelledError
                    if outcome in {"cancel", "send_cancel"}
                    else ConnectionError
                    if outcome == "send_failure"
                    else ValueError
                ):
                    await task
                assert not sent
            assert closed == [True]
            assert len(calls) == 1
        finally:
            release.set()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())
    events = [r.msg for r in caplog.records if isinstance(r.msg, dict)]
    assert events[0]["event"] == "synthesis_received"
    assert [e["event"] for e in events] == (
        ["synthesis_received", "synthesis_generated", "synthesis_delivery"]
        if outcome == "success"
        else ["synthesis_received", "synthesis_delivery"]
    )
    assert events[-1]["outcome"] == (
        "success"
        if outcome == "success"
        else "cancelled"
        if outcome in {"cancel", "send_cancel"}
        else "failed"
    )
    assert events[-1]["operation"] == (
        "process" if outcome in {"failure", "cancel"} else "send"
    )
    assert all(
        e["connection_id"] == events[0]["connection_id"] and e["connection_id"]
        for e in events
    )
    assert all(
        e["request_number"] == 1
        and e["session_id"] == "fixture"
        and e["sequence_id"] == 2
        and e["speech_id"] == 8
        for e in events
    )
    assert "人工音声" not in str(events)
    assert "private-send-error" not in str(events)


def test_cache_timeout_and_partial_initialization_cleanup(monkeypatch):
    manager = VoiceCacheManager(
        "127.0.0.1", 1, "127.0.0.1", 1, "127.0.0.1", 1, "fixture", "fixture"
    )
    try:
        options = manager.redis.connection_pool.connection_kwargs
        assert options["socket_connect_timeout"] == 5
        assert options["socket_timeout"] == 30
        assert options["retry"].get_retries() == 0
        config = manager.s3_client.meta.config
        assert config.connect_timeout == 60
        assert config.read_timeout == 60
        assert config.retries == {"mode": "legacy"}
    finally:
        manager.close()
    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
    redis = Mock()
    s3 = Mock()
    monkeypatch.setattr(module, "Redis", Mock(return_value=redis))
    monkeypatch.setattr(module.boto3, "client", Mock(return_value=s3))
    monkeypatch.setattr(
        module, "VoiceSynthesizer", Mock(side_effect=ValueError("init"))
    )
    with pytest.raises(ValueError, match="init"):
        module.VoiceCacheManager(
            "unused", 1, "unused", 1, "unused", 1, "fixture", "fixture"
        )
    redis.close.assert_called_once()
    s3.close.assert_called_once()


@pytest.mark.parametrize("disconnect", [False, True])
def test_real_worker_websocket_delayed_http_and_close(monkeypatch, disconnect):
    async def run():
        started, release, finished = asyncio.Event(), asyncio.Event(), asyncio.Event()
        handlers = []
        sent = []
        closes = []
        module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
        redis = Mock(get=Mock(return_value=None))
        s3 = Mock(
            get_object=Mock(
                side_effect=ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
            )
        )
        monkeypatch.setattr(module, "Redis", Mock(return_value=redis))
        monkeypatch.setattr(module.boto3, "client", Mock(return_value=s3))
        query = {
            "accent_phrases": [],
            "speedScale": 1,
            "pitchScale": 0,
            "intonationScale": 1,
            "volumeScale": 1,
            "prePhonemeLength": 0.1,
            "postPhonemeLength": 0.1,
            "outputSamplingRate": 24000,
            "outputStereo": False,
            "pauseLength": None,
            "pauseLengthScale": 1,
            "kana": "",
        }
        wav = io.BytesIO()
        with wave.open(wav, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(48000)
            audio.writeframes(b"\0\0" * 2400)

        async def audio_query(request):
            started.set()
            await release.wait()
            return web.json_response(query)

        async def synthesis(request):
            return web.Response(body=wav.getvalue())

        async def connection(request):
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            handlers.append(asyncio.current_task())
            worker = VoiceSynthesizerWorker(
                "127.0.0.1", port, 3, "unused", 1, "unused", 1, "fixture", "fixture"
            )

            async def send_bytes(pack):
                sent.append(pack)
                await ws.send_bytes(pack)

            try:
                await worker.communicate(
                    SimpleNamespace(
                        receive_bytes=ws.receive_bytes, send_bytes=send_bytes
                    )
                )
            except TypeError, ConnectionError:
                pass  # aiohttpの切断通知は音声要求ではない。
            finally:
                worker.close()
                closes.append(True)
                finished.set()
            return ws

        app = web.Application()
        app.router.add_post("/audio_query", audio_query)
        app.router.add_post("/streaming_synthesis", synthesis)
        app.router.add_get("/ws", connection)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = runner.addresses[0][1]
        try:
            async with ClientSession() as client:
                ws = await client.ws_connect(f"http://127.0.0.1:{port}/ws")
                await ws.send_bytes(request_pack())
                await asyncio.wait_for(started.wait(), 3)
                assert not closes
                if disconnect:
                    closing = asyncio.create_task(ws.close())
                    handlers[0].cancel()  # 接続終了・サーバー終了時の親取消を再現する。
                    await asyncio.sleep(0)
                    assert not closes
                    release.set()
                    await asyncio.wait_for(finished.wait(), 5)
                    await closing
                    assert not sent
                else:
                    release.set()
                    result = await asyncio.wait_for(ws.receive_bytes(), 5)
                    assert result
                    final = VoiceSynthesizerChunk.from_msgpack(await ws.receive_bytes())
                    assert final.final
                    await ws.close()
                    await asyncio.wait_for(finished.wait(), 5)
                assert s3.put_object.call_count == (0 if disconnect else 1)
                redis.close.assert_called_once()
                s3.close.assert_called_once()
                assert closes == [True]
        finally:
            release.set()
            await runner.cleanup()

    asyncio.run(run())
