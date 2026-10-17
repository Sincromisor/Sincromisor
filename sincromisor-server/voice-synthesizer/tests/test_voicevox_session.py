"""VOICEVOXのHTTP持続接続、時間切れ、Workerからの解放を確認する。"""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import requests
from voice_synthesizer.VoiceSynthesizer.VoiceSynthesizerWorker import (
    VoiceSynthesizerWorker,
)
from voice_synthesizer.VoiceSynthesizer.VoiceVox import VoiceVox


@pytest.fixture
def endpoint():
    state = SimpleNamespace(connections=[], status=200, delay=0)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self):
            state.connections.append(self.connection)
            time.sleep(state.delay)
            body = json.dumps("test-version").encode()
            self.send_response(state.status)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except BrokenPipeError:
                pass  # 読取り時間切れの試験ではクライアントが先に切断する。

        def log_message(self, *_args):
            pass  # 要求URLをテストログへ出さない。

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    try:
        yield server.server_port, state
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


def test_persistent_connection_and_failures(endpoint):
    port, state = endpoint
    client = VoiceVox(port=port)
    try:
        assert client.version() == "test-version"
        assert client.version() == "test-version"
        assert state.connections[0] is state.connections[1]
        state.status = 503
        with pytest.raises(VoiceVox.ProtocolError) as error:
            client.version()
        assert error.value.status_code == 503
        assert len(state.connections) == 3
        state.status, state.delay = 200, 0.2
        client.HTTP_TIMEOUT = (0.05, 0.05)
        with pytest.raises(requests.Timeout):
            client.version()
        assert len(state.connections) == 4
    finally:
        client.close()


def test_worker_close_reaches_session(monkeypatch):
    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
    monkeypatch.setattr(module, "Redis", Mock())
    monkeypatch.setattr(module.boto3, "client", Mock())
    session = Mock()
    monkeypatch.setattr(requests, "Session", Mock(return_value=session))
    worker = VoiceSynthesizerWorker(
        "unused", 1, 3, "unused", 1, "unused", 1, "key", "secret"
    )
    worker.close()
    session.close.assert_called_once()


def test_failure_before_session_creation(monkeypatch):
    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
    monkeypatch.setattr(module, "Redis", Mock())
    monkeypatch.setattr(
        module.boto3, "client", Mock(side_effect=ValueError("initialization failed"))
    )
    session = Mock()
    monkeypatch.setattr(requests, "Session", session)
    with pytest.raises(ValueError, match="initialization failed"):
        VoiceSynthesizerWorker(
            "unused", 1, 3, "unused", 1, "unused", 1, "key", "secret"
        )
    session.assert_not_called()


@pytest.mark.parametrize("fail", [False, True])
def test_worker_two_requests_use_one_session(endpoint, monkeypatch, fail):
    import asyncio

    from sincro_models import (
        ChatHistory,
        ChatMessage,
        TextProcessorRequest,
        TextProcessorResult,
    )

    port, state = endpoint
    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceCacheManager")
    monkeypatch.setattr(module, "Redis", Mock())
    monkeypatch.setattr(module.boto3, "client", Mock())
    session = requests.Session()
    close = Mock(wraps=session.close)
    monkeypatch.setattr(session, "close", close)
    create = Mock(return_value=session)
    monkeypatch.setattr(requests, "Session", create)

    def get_voice(manager, **_kwargs):
        manager.vsynth.version()
        if fail:
            state.status = 503
        return SimpleNamespace(speech_id=-1, to_msgpack=lambda: b"audio")

    monkeypatch.setattr(module.VoiceCacheManager, "get_voice", get_voice)
    request = TextProcessorRequest(
        session_id="a",
        history=ChatHistory(),
        request_message=ChatMessage(
            speech_id=1, message_type="user", speaker_id="u", speaker_name="u"
        ),
    )
    result = TextProcessorResult.from_request(request, "assistant", "a", "a")
    result.append_response_message("人工本文")
    packs = [result.to_msgpack(), result.to_msgpack(), b""]

    async def receive():
        return packs.pop(0)

    async def send(_pack):
        pass

    worker = VoiceSynthesizerWorker(
        "127.0.0.1", port, 3, "unused", 1, "unused", 1, "key", "secret"
    )
    try:
        if fail:
            with pytest.raises(VoiceVox.ProtocolError):
                asyncio.run(
                    worker.communicate(
                        SimpleNamespace(receive_bytes=receive, send_bytes=send)
                    )
                )
        else:
            asyncio.run(
                worker.communicate(
                    SimpleNamespace(receive_bytes=receive, send_bytes=send)
                )
            )
    finally:
        worker.close()
    create.assert_called_once()
    close.assert_called_once()
    assert len(state.connections) == 2
    assert state.connections[0] is state.connections[1]


def test_audio_query_validates_http_before_json(monkeypatch):
    from pydantic import ValidationError

    client = VoiceVox()
    response = Mock(status_code=503, content=b"invalid-json")
    context = Mock()
    context.__enter__ = Mock(return_value=response)
    context.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(client.session, "post", Mock(return_value=context))
    try:
        with pytest.raises(VoiceVox.ProtocolError):
            client.audio_query("text")
        response.status_code = 200
        with pytest.raises(ValidationError):
            client.audio_query("text")
    finally:
        client.close()
