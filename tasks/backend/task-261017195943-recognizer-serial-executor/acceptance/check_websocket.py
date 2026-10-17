"""既存CUDA検証環境で同梱音声を実プロセスのWebSocket経路へ送る。"""

import asyncio
import runpy
import sys
from pathlib import Path
from unittest.mock import patch

import aiohttp
import numpy as np
import uvicorn
from sincro_config import ServiceDiscoveryReferrer, ServiceDiscoveryReporter
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult
from websockets.asyncio.client import connect


async def check(app):
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=0, log_config=None)
    )
    serving = asyncio.create_task(server.serve())
    try:
        while not server.started:
            if serving.done():
                await serving
            await asyncio.sleep(0.01)
        port = server.servers[0].sockets[0].getsockname()[1]
        voice = np.fromfile(
            "speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/sample02_f32le.raw",
            dtype=np.float32,
        )
        request = SpeechExtractorResult(
            session_id="serial-executor-check",
            speech_id=1,
            sequence_id=1,
            start_at=0,
            confirmed=True,
            voice=(voice * 32767).clip(-32768, 32767).astype(np.int16),
        )
        async with connect(
            f"ws://127.0.0.1:{port}/api/v1/SpeechRecognizer/recognize"
        ) as ws:
            await ws.send(request.to_msgpack())
            async with (
                aiohttp.ClientSession() as session,
                session.get(
                    f"http://127.0.0.1:{port}/api/v1/SpeechRecognizer/statuses"
                ) as response,
            ):
                assert response.status == 200
            result = SpeechRecognizerResult.from_msgpack(
                await asyncio.wait_for(ws.recv(), 120)
            )
            assert result.confirmed
            assert result.result_text()
            assert result.sequence_id == 1
        assert list(Path("/tmp/recognition-check").rglob("*.opus"))
    finally:
        server.should_exit = True
        await serving


def serve(app, **_kwargs):
    asyncio.run(check(app))


sys.argv = [
    "check",
    "--consul-agent-host",
    "unused",
    "--consul-agent-port",
    "8500",
    "--voice-log-dir",
    "/tmp/recognition-check",
]
with (
    patch.object(ServiceDiscoveryReporter, "start"),
    patch.object(ServiceDiscoveryReferrer, "get_random_worker", return_value=None),
    patch("uvicorn.run", side_effect=serve),
):
    runpy.run_path(
        "speech-recognizer-nemo/SpeechRecognizerNemoProcess.py", run_name="__main__"
    )
print("WebSocket recognition, status, local Opus storage and shutdown: PASS")
