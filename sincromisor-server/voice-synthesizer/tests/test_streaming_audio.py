"""HTTP区間の早期配送、WAV完全性、正常時だけの保存と取消後の回収を確認する。"""

import asyncio
import io
import struct
import wave
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sincro_models import VoiceSynthesizerChunk, VoiceSynthesizerRequest, VoiceVoxQuery
from voice_synthesizer.stream_delivery import deliver_stream
from voice_synthesizer.voice_stream import StreamContext, stream_voice
from voice_synthesizer.wav_stream import MAX_PCM_BYTES, iter_pcm


def query():
    return VoiceVoxQuery(
        accent_phrases=[],
        speedScale=1,
        pitchScale=0,
        intonationScale=1,
        volumeScale=1,
        prePhonemeLength=0.1,
        postPhonemeLength=0.1,
        pauseLength=None,
        pauseLengthScale=1,
        outputSamplingRate=48_000,
        outputStereo=False,
        kana="",
    )


def wav_bytes(pcm):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(48_000)
        audio.writeframes(pcm)
    return output.getvalue()


@pytest.mark.parametrize("size", [1, 3, 43, 44, 45, 1000, 9600, 50000])
def test_arbitrary_http_boundaries(size):
    pcm = struct.pack("<h", 1000) * 14_407
    wav = wav_bytes(pcm)
    result = list(iter_pcm(wav[i : i + size] for i in range(0, len(wav), size)))
    assert b"".join(result) == pcm
    assert all(0 < len(part) <= 9600 and len(part) % 2 == 0 for part in result)


@pytest.mark.parametrize(
    "kind",
    [
        "truncated",
        "trailing",
        "empty",
        "codec",
        "stereo",
        "rate",
        "odd",
        "oversized",
        "riff",
    ],
)
def test_invalid_wav_never_completes(kind):
    wav = bytearray(wav_bytes(b"\0\1" * 100))
    if kind == "truncated":
        wav.pop()
    if kind == "trailing":
        wav.extend(b"\0\0")
    if kind == "empty":
        wav = bytearray()
    if kind == "codec":
        struct.pack_into("<H", wav, 20, 3)
    if kind == "stereo":
        struct.pack_into("<H", wav, 22, 2)
    if kind == "rate":
        struct.pack_into("<I", wav, 24, 24000)
    if kind == "odd":
        struct.pack_into("<I", wav, 40, 201)
    if kind == "oversized":
        struct.pack_into("<I", wav, 40, MAX_PCM_BYTES + 2)
    if kind == "riff":
        struct.pack_into("<I", wav, 4, 1)
    with pytest.raises(ValueError, match="streaming WAV|Streaming WAV"):
        list(iter_pcm([bytes(wav)]))


@pytest.mark.parametrize("outcome", ["complete", "cancel", "failure", "close"])
def test_stream_cache_saved_only_after_complete(outcome):
    context = StreamContext(1, Event(), {})
    request = VoiceSynthesizerRequest(speech_id=8, message="人工音声", style_id=3)
    finished = []

    def generated(*args):
        try:
            yield query(), b"\1\0" * 4800
            if outcome == "failure":
                raise ValueError("truncated")
            yield query(), b"\2\0" * 100
        finally:
            finished.append(True)

    manager = SimpleNamespace(
        load_cached_voice=Mock(return_value=None),
        save_cached_voice=Mock(),
        vsynth=SimpleNamespace(generate_pcm=generated),
    )
    iterator = stream_voice(manager, request, context)
    first = next(iterator)
    assert not first.final
    assert first.sequence == 0
    assert first.sample_offset == 0
    manager.save_cached_voice.assert_not_called()
    if outcome == "complete":
        tail = list(iterator)
        assert tail[-1].final
        assert tail[-1].sample_offset == 4900
        assert tail[0].sample_offset == 4800
        assert not tail[0].message
        cached_request, result, _ = manager.save_cached_voice.call_args.args
        assert cached_request.redis_key().startswith("streaming-pcm-v1/")
        with wave.open(io.BytesIO(result.voice)) as wav:
            assert wav.readframes(4900) == first.pcm + tail[0].pcm
        manager.load_cached_voice.return_value = result
        again = list(stream_voice(manager, request, StreamContext(2, Event(), {})))
        assert b"".join(c.pcm for c in again) == first.pcm + tail[0].pcm
        assert again[-1].final
        assert again[0].request_id == 2
        assert manager.save_cached_voice.call_count == 1
    elif outcome == "close":
        iterator.close()
    else:
        if outcome == "cancel":
            context.cancelled.set()
        with pytest.raises(InterruptedError if outcome == "cancel" else ValueError):
            list(iterator)
        manager.save_cached_voice.assert_not_called()
    assert finished == [True]


@pytest.mark.parametrize("outcome", ["cancel", "send_failure", "send_timeout"])
def test_delivery_bounds_read_ahead_and_recovers(outcome, monkeypatch):
    async def run():
        started = asyncio.Event()
        release = Event()
        loop = asyncio.get_running_loop()
        closed, reads = [], []
        context = StreamContext(1, Event(), {})

        def chunks():
            try:
                reads.append(1)
                if outcome == "cancel":
                    loop.call_soon_threadsafe(started.set)
                    assert release.wait(3)
                yield VoiceSynthesizerChunk(
                    request_id=1,
                    speech_id=8,
                    sequence=0,
                    sample_offset=0,
                    final=False,
                    pcm=b"\0\1" * 4800,
                    message="人工音声",
                    mora_queue=[],
                )
                reads.append(2)
            finally:
                closed.append(True)

        async def send(_):
            started.set()
            if outcome == "send_failure":
                raise ConnectionError("send")
            await asyncio.Event().wait()

        if outcome == "send_timeout":
            monkeypatch.setattr(
                "voice_synthesizer.stream_delivery.SEND_TIMEOUT_SECONDS", 0.01
            )
        task = asyncio.create_task(
            deliver_stream(SimpleNamespace(send_bytes=send), chunks(), context)
        )
        await asyncio.wait_for(started.wait(), 2)
        assert reads == [1]
        if outcome == "cancel":
            task.cancel()
            await asyncio.sleep(0)
            task.cancel()
            await asyncio.sleep(0)
            assert context.cancelled.is_set()
            assert not task.done()
            assert not closed
            release.set()
        with pytest.raises(
            asyncio.CancelledError
            if outcome == "cancel"
            else ConnectionError
            if outcome == "send_failure"
            else TimeoutError
        ):
            await task
        assert context.cancelled.is_set()
        assert closed == [True]
        assert reads == [1]

    asyncio.run(run())


@pytest.mark.parametrize(
    "outcome", ["complete", "cancel", "truncated", "http_error", "disconnect"]
)
@pytest.mark.parametrize("detailed", [False, True])
def test_production_worker_streams_before_http_eof(
    monkeypatch, caplog, outcome, detailed
):
    import json
    import logging
    from importlib import import_module

    from aiohttp import web
    from botocore.exceptions import ClientError
    from test_blocking_work import request_pack
    from voice_synthesizer.VoiceSynthesizer import VoiceSynthesizerWorker

    caplog.set_level(logging.INFO)
    monkeypatch.setenv("SINCRO_LOG_SYNTHESIS_ENABLED", str(detailed).lower())

    async def run():
        release = asyncio.Event()
        first = asyncio.Event()
        sent, http_parameters, http_done = [], [], []
        redis = Mock(get=Mock(return_value=None))
        s3 = Mock(
            get_object=Mock(
                side_effect=ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
            )
        )
        module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
        monkeypatch.setattr(module, "Redis", Mock(return_value=redis))
        monkeypatch.setattr(module.boto3, "client", Mock(return_value=s3))
        wav = wav_bytes(b"\1\0" * 24001)

        async def audio_query(request):
            return web.json_response(query().model_dump())

        async def synthesis(request):
            http_parameters.append(dict(request.query))
            data = await request.json()
            assert data["outputSamplingRate"] == 48000
            assert data["outputStereo"] is False
            if outcome == "http_error":
                return web.Response(status=503)
            response = web.StreamResponse(headers={"Content-Length": str(len(wav))})
            await response.prepare(request)
            await response.write(wav[:19244])
            await release.wait()
            try:
                if outcome == "truncated":
                    request.transport.close()
                else:
                    await response.write(wav[19244:])
                    await response.write_eof()
            except ConnectionError:
                pass  # 取消・切断試験ではクライアントが先にHTTP応答を解放する。
            http_done.append(True)
            return response

        app = web.Application()
        app.router.add_post("/audio_query", audio_query)
        app.router.add_post("/streaming_synthesis", synthesis)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        worker = VoiceSynthesizerWorker(
            "127.0.0.1",
            runner.addresses[0][1],
            3,
            "unused",
            1,
            "unused",
            1,
            "fixture",
            "fixture",
        )
        packs = [request_pack(), b""]

        async def receive():
            return packs.pop(0)

        async def send(packed):
            chunk = VoiceSynthesizerChunk.from_msgpack(packed)
            first.set()
            if outcome == "disconnect":
                raise ConnectionError("send disconnected")
            sent.append(chunk)

        task = asyncio.create_task(
            worker.communicate(SimpleNamespace(receive_bytes=receive, send_bytes=send))
        )
        try:
            if outcome != "http_error":
                await asyncio.wait_for(first.wait(), 3)
                assert not http_done
                assert not s3.put_object.called
                assert not redis.set.called
                assert outcome == "disconnect" or sent[0].sample_offset == 0
                if outcome == "cancel":
                    task.cancel()
                    await asyncio.sleep(0)
                release.set()
            if outcome == "complete":
                await asyncio.wait_for(task, 3)
                assert sent[-1].final
                assert b"".join(c.pcm for c in sent) == b"\1\0" * 24001
                assert [c.sequence for c in sent] == list(range(len(sent)))
                assert [c.sample_offset for c in sent] == [
                    0,
                    4800,
                    9600,
                    14400,
                    19200,
                    24000,
                    24001,
                ]
                assert all(not c.message and not c.mora_queue for c in sent[1:])
                s3.put_object.assert_called_once()
                redis.set.assert_called_once()
            else:
                with pytest.raises(
                    asyncio.CancelledError if outcome == "cancel" else Exception
                ):
                    await asyncio.wait_for(task, 3)
                assert not any(c.final for c in sent)
                s3.put_object.assert_not_called()
                redis.set.assert_not_called()
            assert http_parameters == [
                {"speaker": "3", "segment_length": "0.3", "max_segment_length": "2.4"}
            ]
        finally:
            release.set()
            await asyncio.gather(task, return_exceptions=True)
            worker.close()
            await runner.cleanup()

    asyncio.run(run())
    complete = [
        record.msg
        for record in caplog.records
        if isinstance(record.msg, dict)
        and record.msg.get("event") == "synthesis_engine_complete"
    ]
    assert len(complete) == (1 if outcome == "complete" else 0)
    if complete:
        assert complete[0]["completed_unix_ns"] > 0
    assert "人工音声" not in json.dumps(complete, ensure_ascii=False)

    rows = [r.msg for r in caplog.records if isinstance(r.msg, dict)]
    requests = [r for r in rows if r.get("event") == "synthesis_request"]
    results = [r for r in rows if r.get("event") == "synthesis_result"]
    processing = [r for r in rows if r.get("event") == "synthesis_processing"]
    assert len(requests) == int(detailed)
    assert len(results) == int(detailed and outcome == "complete")
    assert processing[0]["outcome"] == "started"
    assert processing[-1]["cache"] == "generated"
    assert processing[-1]["duration_ms"] >= 0
    assert processing[-1]["outcome"] == (
        "success"
        if outcome == "complete"
        else "cancelled"
        if outcome in {"cancel", "disconnect"}
        else "failed"
    )
    if not detailed:
        assert "人工音声" not in str(rows)
