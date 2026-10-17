"""中央試験用にHTTP合成成功と送信失敗を本番JSONフォーマッターから出力する。"""

import asyncio
import io
import json
import logging
import os
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError
from sincro_config.SincromisorLoggerConfig import JsonLogFormatter
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from test_blocking_work import request_pack
from voice_synthesizer.VoiceSynthesizer import VoiceSynthesizerWorker


def test_central_log_fixture(monkeypatch):
    directory = os.environ.get("SINCRO_DIAGNOSTIC_FIXTURE_DIR")
    if not directory:
        pytest.skip("中央結合試験専用")
    monkeypatch.setenv("SINCRO_LOG_CONVERSATION_ENABLED", "false")
    monkeypatch.setenv("SINCRO_LOG_SYNTHESIS_ENABLED", "false")
    wav = io.BytesIO()
    with wave.open(wav, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(b"\0\0" * 240)
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
        "kana": "private-kana",
    }

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # reason: 標準HTTPサーバーのコールバック名
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps(query).encode()
                if self.path.startswith("/audio_query")
                else wav.getvalue()
            )

        def log_message(self, *args):
            pass  # 要求URLを試験出力へ混ぜない。

    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
    monkeypatch.setattr(
        module, "Redis", Mock(return_value=Mock(get=Mock(return_value=None)))
    )
    monkeypatch.setattr(
        module.boto3,
        "client",
        Mock(
            return_value=Mock(
                get_object=Mock(
                    side_effect=ClientError(
                        {"Error": {"Code": "NoSuchKey"}}, "GetObject"
                    )
                )
            )
        ),
    )
    # この確認は配送診断が対象。エンコーダー実行を追加せず、実HTTP/WAV生成の結果を使う。
    get_voice = module.VoiceCacheManager.get_voice

    def get_wav(self, vs_request, **ids):
        return get_voice(
            self, vs_request.model_copy(update={"audio_format": "audio/wav"}), **ids
        )

    monkeypatch.setattr(module.VoiceCacheManager, "get_voice", get_wav)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    path = Path(directory) / "python-delivery.jsonl"
    handler = logging.FileHandler(path)
    handler.setFormatter(JsonLogFormatter())
    logger = logging.getLogger("sincro")
    previous = logger.level, logger.propagate
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)
    worker = VoiceSynthesizerWorker(
        "127.0.0.1",
        server.server_port,
        3,
        "unused",
        1,
        "unused",
        1,
        "fixture",
        "private-key",
    )
    diagnostic = WebSocketDiagnostics(
        logging.getLogger("sincro.VoiceSynthesizerWorker")
    )

    async def receive_bytes():
        return request_pack()

    async def send_bytes(pack):
        assert pack
        raise ConnectionError("private-send-error")

    try:
        diagnostic.start()
        with pytest.raises(ConnectionError):
            asyncio.run(
                worker.communicate(
                    SimpleNamespace(receive_bytes=receive_bytes, send_bytes=send_bytes),
                    diagnostic,
                )
            )
        diagnostic.finish()
    finally:
        worker.close()
        handler.flush()
        logger.removeHandler(handler)
        logger.setLevel(previous[0])
        logger.propagate = previous[1]
        handler.close()
        server.shutdown()
        thread.join()
        server.server_close()
    text = path.read_text()
    assert "private-" not in text
    assert "人工音声" not in text
    events = [json.loads(line) for line in text.splitlines()]
    assert any(
        e["event"] == "synthesis_processing" and e["outcome"] == "success"
        for e in events
    )
    assert any(e["event"] == "synthesis_generated" for e in events)
    assert any(
        e["event"] == "synthesis_delivery"
        and e["operation"] == "send"
        and e["outcome"] == "failed"
        for e in events
    )
    assert events[-1]["event"] == "websocket_finished"
