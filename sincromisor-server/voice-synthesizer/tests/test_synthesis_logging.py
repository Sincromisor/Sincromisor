"""HTTP代役と実キャッシュ処理で本文切替・生成条件・失敗の安全な記録を確認する。"""

import asyncio
import io
import json
import logging
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import import_module
from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from sincro_config import SincromisorLoggerConfig
from sincro_config.SincromisorLoggerConfig import JsonLogFormatter
from sincro_models import VoiceSynthesizerRequest
from voice_synthesizer.VoiceSynthesizer import VoiceCacheManager


@pytest.mark.parametrize("conversation", ["true", "false"])
@pytest.mark.parametrize("synthesis", ["true", "false"])
def test_generation_cache_and_failure(monkeypatch, conversation, synthesis):
    monkeypatch.setenv("SINCRO_LOG_CONVERSATION_ENABLED", conversation)
    monkeypatch.setenv("SINCRO_LOG_SYNTHESIS_ENABLED", synthesis)
    state = SimpleNamespace(failed=False, calls=0)
    query = {
        "accent_phrases": [],
        "speedScale": 1.1,
        "pitchScale": 0,
        "intonationScale": 1,
        "volumeScale": 1,
        "prePhonemeLength": 0.1,
        "postPhonemeLength": 0.1,
        "pauseLength": None,
        "pauseLengthScale": 1,
        "outputSamplingRate": 24000,
        "outputStereo": False,
        "kana": "人工カナ",
    }
    wav = io.BytesIO()
    with wave.open(wav, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(b"\0\0" * 240)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # reason: 標準HTTPサーバーのコールバック名
            state.calls += 1
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            self.send_response(503 if state.failed else 200)
            self.end_headers()
            self.wfile.write(
                json.dumps(query).encode()
                if self.path.startswith("/audio_query")
                else wav.getvalue()
            )

        def log_message(self, *args):
            pass  # HTTP代役は要求URLを出力せず、対象の運用ハンドラーだけを検証する。

    redis_data = {}
    s3_data = {}
    redis = SimpleNamespace(
        get=redis_data.get,
        set=lambda key, value, **kwargs: redis_data.update({key: value}),
    )

    def get_object(**kwargs):
        if kwargs["Key"] not in s3_data:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        value = s3_data[kwargs["Key"]]
        return {"Body": StreamingBody(io.BytesIO(value), len(value))}

    s3 = SimpleNamespace(
        get_object=get_object,
        put_object=lambda **kwargs: s3_data.update(
            {kwargs["Key"]: kwargs["Body"].read()}
        ),
    )
    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
    monkeypatch.setattr(module, "Redis", lambda **kwargs: redis)
    monkeypatch.setattr(module.boto3, "client", lambda *args, **kwargs: s3)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    manager = VoiceCacheManager(
        "127.0.0.1",
        server.server_port,
        "unused",
        1,
        "unused",
        1,
        "fixture",
        "fixture-secret",
    )
    output = io.StringIO()
    handler = logging.StreamHandler(output)
    handler.setFormatter(JsonLogFormatter())
    logger = manager.logger
    previous = logger.level, logger.propagate
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)
    request = VoiceSynthesizerRequest(
        speech_id=8,
        message="人工本文・青い鳥621",
        style_id=3,
        audio_format="audio/wav",
        pre_phoneme_length=0.2,
        post_phoneme_length=0.3,
    )
    try:
        results = []
        for source in ("generated", "redis", "s3"):
            if source == "s3":
                redis_data.clear()
            results.append(
                manager.get_voice(
                    request, session_id="session-a", sequence_id=2
                ).to_msgpack()
            )
        assert results[0] == results[1] == results[2]
        assert state.calls == 2
        redis_data.clear()
        s3_data.clear()
        state.failed = True
        with pytest.raises(VoiceCacheManager.VoiceSynthesizerServerException):
            manager.get_voice(request, session_id="session-a", sequence_id=2)
        text = output.getvalue()
        events = [json.loads(line) for line in text.splitlines()]
        assert "fixture-secret" not in text
        assert "audio_query?" not in text
        assert "voice" not in events[-1]
        assert events[-1]["outcome"] == "failed"
        assert events[-1]["http_status"] == 503
        assert all(
            event["session_id"] == "session-a"
            and event["speech_id"] == 8
            and event["sequence_id"] == 2
            for event in events
        )
        if synthesis == "true":
            completed = [
                event for event in events if event["event"] == "synthesis_result"
            ]
            assert [event["cache"] for event in completed] == [
                "generated",
                "redis",
                "s3",
            ]
            assert completed[0]["parameters"]["prePhonemeLength"] == 0.2
            assert completed[0]["parameters"]["postPhonemeLength"] == 0.3
            assert completed[0]["parameters"]["speedScale"] == 1.1
            assert completed[0]["style_id"] == 3
            assert "人工本文" in text
        else:
            assert "人工本文" not in text
            assert "人工カナ" not in text
            assert all(
                event["event"] in {"synthesis_processing", "voice_cache_operation"}
                for event in events
            )
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous[0])
        logger.propagate = previous[1]
        server.shutdown()
        thread.join()
        server.server_close()


@pytest.mark.parametrize("value", [None, "true", "false", "", "TRUE", "private-input"])
def test_synthesis_setting(monkeypatch, value):
    key = "SINCRO_LOG_SYNTHESIS_ENABLED"
    if value is None:
        monkeypatch.delenv(key, raising=False)
    else:
        monkeypatch.setenv(key, value)
    if value in (None, "true", "false"):
        assert SincromisorLoggerConfig.synthesis_enabled() == (value != "false")
    else:
        with pytest.raises(ValueError, match=key) as error:
            SincromisorLoggerConfig.generate()
        assert "private-input" not in str(error.value)


def test_worker_preserves_ids_and_skips_final(monkeypatch):
    from sincro_models import (
        ChatHistory,
        ChatMessage,
        TextProcessorRequest,
        TextProcessorResult,
    )
    from voice_synthesizer.VoiceSynthesizer.VoiceSynthesizerWorker import (
        VoiceSynthesizerWorker,
    )

    calls = []
    voice = SimpleNamespace(speech_id=-1, to_msgpack=lambda: b"audio")

    def get_voice(**kwargs):
        calls.append(kwargs)
        return voice

    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceSynthesizerWorker")
    monkeypatch.setattr(
        module,
        "VoiceCacheManager",
        lambda **kwargs: SimpleNamespace(get_voice=get_voice),
    )
    worker = VoiceSynthesizerWorker(
        "unused", 1, 3, "unused", 1, "unused", 1, "fixture", "fixture"
    )
    request = TextProcessorRequest(
        session_id="session-a",
        sequence_id=2,
        history=ChatHistory(),
        request_message=ChatMessage(
            speech_id=8, message_type="user", speaker_id="u", speaker_name="u"
        ),
    )
    result = TextProcessorResult.from_request(request, "assistant", "a", "a")
    result.append_response_message("人工本文")
    packs = [result.to_msgpack()]
    result.finalize()
    packs.extend([result.to_msgpack(), b""])
    sent = []

    async def receive_bytes():
        return packs.pop(0)

    async def send_bytes(pack):
        sent.append(pack)

    asyncio.run(
        worker.communicate(
            SimpleNamespace(receive_bytes=receive_bytes, send_bytes=send_bytes)
        )
    )
    assert len(calls) == 1
    assert calls[0]["session_id"] == "session-a"
    assert calls[0]["sequence_id"] == 2
    assert calls[0]["vs_request"].message == "人工本文"
    assert calls[0]["vs_request"].style_id == 3
    assert voice.speech_id == 8
    assert sent == [b"audio"]
