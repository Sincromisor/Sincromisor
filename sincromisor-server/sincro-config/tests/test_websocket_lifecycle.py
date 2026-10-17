"""全サービスの実入口をモデルの代役で動かし、接続と主原因の対応を確認する。"""

import asyncio
import logging
import logging.config
import runpy
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect
from sincro_config import ServiceDiscoveryReferrer, ServiceDiscoveryReporter
from sincro_config.SincromisorLoggerConfig import JsonLogFormatter
from sincro_models import SpeechExtractorInitializeRequest, SpeechExtractorResult
from starlette.websockets import WebSocketState


@pytest.mark.parametrize(
    ("service", "process", "route"),
    [
        ("speech-extractor", "SpeechExtractor", "extract"),
        ("speech-recognizer-nemo", "SpeechRecognizerNemo", "recognize"),
        ("text-processor", "TextProcessor", "sincro"),
        ("voice-synthesizer", "VoiceSynthesizer", "synthesize"),
    ],
)
@pytest.mark.parametrize("scenario", ["normal", "abnormal", "send", "cancel"])
def test_service_entry_diagnostics(
    monkeypatch, caplog, service, process, route, scenario
):
    caplog.set_level(logging.INFO)
    monkeypatch.setattr(logging.config, "dictConfig", lambda _: None)
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
    monkeypatch.setattr(ServiceDiscoveryReporter, "start", lambda _: None)
    monkeypatch.setattr(
        ServiceDiscoveryReferrer,
        "get_random_worker",
        lambda *args, **kwargs: SimpleNamespace(
            service_address="unused", service_port=1
        ),
    )

    class Worker:
        def __init__(self, *args, **kwargs):
            self.process_owned = bool(args)

        @staticmethod
        def setup_model():
            pass

        @staticmethod
        def close_model():
            pass

        def close(self):
            if scenario == "send" and not self.process_owned:
                raise RuntimeError("secret-cleanup")

        async def communicate(self, ws, diagnostic):
            with diagnostic.operation("receive"):
                await ws.receive_bytes()
            diagnostic.ids = {"session_id": "fixture-session"}
            with diagnostic.operation("send"):
                await ws.send_bytes(b"secret-audio")

        async def extract(self, ws, max_silence_ms, diagnostic):
            with diagnostic.operation("send"):
                await ws.send_bytes(b"secret-audio")

        async def recognize(self, **kwargs):
            return SimpleNamespace(to_msgpack=lambda: b"secret-audio")

    # モデルのimport時初期化も避け、実入口だけを対象にする。
    stubs = {
        "speech_extractor.SpeechExtractor": SimpleNamespace(
            SpeechExtractorWorker=Worker
        ),
        "speech_recognizer_nemo.SpeechRecognizerNemo": SimpleNamespace(
            SpeechRecognizerNemoWorker=Worker
        ),
        "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerS3Client": SimpleNamespace(
            SpeechRecognizerS3Client=Worker
        ),
        "speech_recognizer_nemo.recognizer_execution": SimpleNamespace(
            RecognizerExecution=Worker
        ),
        "text_processor.TextProcessor": SimpleNamespace(
            TextProcessorWorker=Worker, PokeTextProcessorWorker=Worker
        ),
        "text_processor.mastra_worker": SimpleNamespace(
            MastraTextProcessorWorker=Worker
        ),
        "voice_synthesizer.VoiceSynthesizer": SimpleNamespace(
            VoiceSynthesizerWorker=Worker
        ),
    }
    for module, stub in stubs.items():
        monkeypatch.setitem(sys.modules, module, stub)

    if service == "voice-synthesizer":
        monkeypatch.setattr(
            sys,
            "argv",
            [*sys.argv, "--s3-access-key", "fixture", "--s3-secret-key", "fixture"],
        )
    namespace = runpy.run_path(
        str(Path(__file__).parents[2] / service / f"{process}Process.py")
    )
    process_class = namespace[f"{process}Process"]
    globals_ = process_class.start.__globals__
    for key in [
        "SpeechExtractorWorker",
        "RecognizerExecution",
        "SpeechRecognizerS3Client",
        "PokeTextProcessorWorker",
        "VoiceSynthesizerWorker",
    ]:
        if key in globals_:
            monkeypatch.setitem(globals_, key, Worker)

    class Socket:
        client_state = WebSocketState.CONNECTED
        application_state = WebSocketState.CONNECTED

        async def accept(self):
            pass

        async def receive_bytes(self):
            if scenario in ("normal", "abnormal"):
                self.client_state = WebSocketState.DISCONNECTED
                raise WebSocketDisconnect(
                    1000 if scenario == "normal" else 1011, "secret-close"
                )
            if scenario == "cancel":
                raise asyncio.CancelledError("secret-cancel")
            if service == "speech-extractor":
                return SpeechExtractorInitializeRequest(
                    session_id="fixture-session"
                ).to_msgpack()
            return SpeechExtractorResult(
                session_id="fixture-session", speech_id=1, sequence_id=1, start_at=0
            ).to_msgpack()

        async def send_bytes(self, _):
            raise RuntimeError("secret-send")

        async def close(self):
            assert self.client_state != WebSocketState.DISCONNECTED
            if scenario == "send":
                raise RuntimeError("secret-close-cleanup")

    def run(app, **kwargs):
        endpoint = next(r.endpoint for r in app.routes if r.path.endswith(f"/{route}"))

        async def connections():
            results = await asyncio.gather(
                endpoint(Socket()), endpoint(Socket()), return_exceptions=True
            )
            if scenario == "cancel":
                assert all(
                    isinstance(error, asyncio.CancelledError) for error in results
                )
            else:
                assert results == [None, None]

        asyncio.run(connections())

    monkeypatch.setattr("uvicorn.run", run)
    process_class(namespace["args"]).start()
    records = [r for r in caplog.records if isinstance(r.msg, dict)]
    starts = [r.msg for r in records if r.msg.get("event") == "websocket_started"]
    ends = [r.msg for r in records if r.msg.get("event") == "websocket_finished"]
    assert len(starts) == len(ends) == 2
    assert len({r["connection_id"] for r in starts}) == 2
    assert {r["connection_id"] for r in starts} == {r["connection_id"] for r in ends}
    for row in ends:
        assert row["operation"] == ("send" if scenario == "send" else "receive")
        assert (
            row["outcome"]
            == {
                "normal": "normal",
                "abnormal": "failed",
                "send": "failed",
                "cancel": "cancelled",
            }[scenario]
        )
        if scenario == "send":
            assert row["session_id"] == "fixture-session"
        else:
            assert "session_id" not in row
    assert all("secret-" not in JsonLogFormatter().format(r) for r in records)
    if scenario == "send":
        assert any(r.msg.get("event") == "websocket_cleanup_failed" for r in records)
