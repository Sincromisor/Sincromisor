"""実WebSocket受信処理へ固定MessagePackを渡し、累積音声の有効範囲と所有を確認する。"""

import asyncio
import runpy
import sys
from pathlib import Path

import numpy as np
from sincro_config import ServiceDiscoveryReferrer, ServiceDiscoveryReporter
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult
from speech_recognizer_nemo import recognizer_execution
from starlette.websockets import WebSocketState


def test_receive_buffer_capacity_and_speech_ids(monkeypatch):
    requests = [
        SpeechExtractorResult(
            session_id="a",
            speech_id=speech,
            sequence_id=index,
            confirmed=confirmed,
            start_at=0,
            voice=np.arange(size, dtype=np.int16),
        )
        for index, (speech, size, confirmed) in enumerate(
            [(1, 4, False), (1, 1, False), (1, 1, False), (1, 10, True), (2, 3, True)],
            1,
        )
    ]
    received, sent, backing = [], [], []

    class Execution:
        def __init__(self, factory):
            pass

        async def recognize(self, spe_result, s3_client):
            voice = spe_result.voice
            assert voice.flags.writeable
            assert voice.flags.c_contiguous
            assert voice.dtype == np.int16
            received.append(voice.copy())
            backing.append(voice.base)
            await asyncio.sleep(0)
            np.testing.assert_array_equal(voice, received[-1])
            return SpeechRecognizerResult(
                session_id=spe_result.session_id,
                speech_id=spe_result.speech_id,
                sequence_id=spe_result.sequence_id,
                start_at=spe_result.start_at,
                confirmed=spe_result.confirmed,
                result=[("認識", 1.0)],
            )

        def close(self):
            pass

    class Socket:
        client_state = WebSocketState.CONNECTED
        application_state = WebSocketState.CONNECTED

        def __init__(self):
            self.packs = [request.to_msgpack() for request in requests] + [b""]

        async def accept(self):
            pass

        async def receive_bytes(self):
            return self.packs.pop(0)

        async def send_bytes(self, pack):
            sent.append(SpeechRecognizerResult.from_msgpack(pack))

        async def close(self):
            pass

    def run(app, **kwargs):
        route = next(route for route in app.routes if route.path.endswith("/recognize"))
        asyncio.run(route.endpoint(Socket()))

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "test",
            "--consul-agent-host",
            "unused",
            "--consul-agent-port",
            "8500",
            "--public-bind-host",
            "127.0.0.1",
        ],
    )
    monkeypatch.setattr(ServiceDiscoveryReporter, "start", lambda self: None)
    monkeypatch.setattr(
        ServiceDiscoveryReferrer, "get_random_worker", lambda *args, **kwargs: None
    )
    monkeypatch.setattr(recognizer_execution, "RecognizerExecution", Execution)
    monkeypatch.setattr("uvicorn.run", run)
    runpy.run_path(
        str(Path(__file__).parents[1] / "SpeechRecognizerNemoProcess.py"),
        run_name="__main__",
    )
    expected = np.empty(0, dtype=np.int16)
    previous_speech = -1
    for request, voice, response in zip(requests, received, sent, strict=True):
        expected = (
            request.voice.copy()
            if request.speech_id != previous_speech
            else np.append(expected, request.voice)
        )
        previous_speech = request.speech_id
        np.testing.assert_array_equal(voice, expected)
        assert (response.speech_id, response.sequence_id, response.confirmed) == (
            request.speech_id,
            request.sequence_id,
            request.confirmed,
        )
    assert backing[1] is backing[2]
    assert backing[2] is not backing[3]
    assert backing[3] is backing[4]
