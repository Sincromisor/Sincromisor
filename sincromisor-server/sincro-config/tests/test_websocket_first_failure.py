"""実対話ワーカーで同時失敗、後始末取消、外部取消の主原因を確認する。"""

import asyncio
import importlib.util
import logging
from pathlib import Path

import pytest
from fastapi import WebSocketDisconnect
from sincro_config.SincromisorLoggerConfig import JsonLogFormatter
from sincro_config.websocket_diagnostics import WebSocketDiagnostics


@pytest.mark.parametrize("scenario", ["simultaneous", "normal", "cancel"])
def test_first_failure_survives_child_cleanup(caplog, scenario):
    caplog.set_level(logging.INFO)
    # 形態素解析器の初期化を避け、変更対象の基底ワーカーそのものを読む。
    path = (
        Path(__file__).parents[2]
        / "text-processor/src/text_processor/TextProcessor/TextProcessorWorker.py"
    )
    spec = importlib.util.spec_from_file_location("diagnostic_text_worker", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    async def run():
        worker = module.TextProcessorWorker()
        diagnostic = WebSocketDiagnostics(worker.logger)
        started = asyncio.Event()

        async def receive(*args):
            with diagnostic.operation("receive"):
                if scenario == "simultaneous":
                    raise WebSocketDisconnect(1000, "secret-close")
                if scenario == "normal":
                    await started.wait()
                    return
                await asyncio.Future()

        async def process(*args):
            with diagnostic.operation("process"):
                started.set()
                if scenario == "simultaneous":
                    raise ValueError("secret-secondary")
                await asyncio.Future()

        worker._TextProcessorWorker__receive_requests = receive  # noqa: SLF001  # reason: 同時完了順と外部取消を確定的に再現する。
        worker._TextProcessorWorker__process_requests = process  # noqa: SLF001  # reason: 応答待ちを外部サービスなしで再現する。
        task = asyncio.create_task(worker.communicate(None, diagnostic=diagnostic))
        if scenario == "cancel":
            await started.wait()
            task.cancel()
        try:
            await task
        except (WebSocketDisconnect, ValueError, asyncio.CancelledError) as error:
            diagnostic.finish(error)
        else:
            diagnostic.finish()

    asyncio.run(run())
    record = next(
        r
        for r in caplog.records
        if isinstance(r.msg, dict) and r.msg.get("event") == "websocket_finished"
    )
    assert record.msg["outcome"] == ("cancelled" if scenario == "cancel" else "normal")
    if scenario == "simultaneous":
        assert record.msg["operation"] == "receive"
        assert record.msg["exception_type"] == "WebSocketDisconnect"
        assert record.msg["close_code"] == 1000
    assert "secret-" not in JsonLogFormatter().format(record)


@pytest.mark.parametrize("primary", [False, True])
def test_mastra_pool_cleanup_keeps_primary(monkeypatch, caplog, primary):
    import sys
    from types import SimpleNamespace

    caplog.set_level(logging.INFO)
    root = Path(__file__).parents[2] / "text-processor/src/text_processor"
    spec = importlib.util.spec_from_file_location(
        "text_processor.TextProcessor.TextProcessorWorker",
        root / "TextProcessor/TextProcessorWorker.py",
    )
    base = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(base)
    monkeypatch.setitem(sys.modules, spec.name, base)
    spec = importlib.util.spec_from_file_location(
        "text_processor.mastra_worker", root / "mastra_worker.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    async def communicate(self, ws, diagnostic):
        if primary:
            with diagnostic.operation("receive"):
                raise WebSocketDisconnect(1011, "secret-primary")

    monkeypatch.setattr(base.TextProcessorWorker, "communicate", communicate)

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            raise RuntimeError("secret-cleanup")

    async def run():
        worker = module.MastraTextProcessorWorker("http://unused", "unused", "unused")
        worker.mastra_client = Client()
        diagnostic = WebSocketDiagnostics(worker.logger)
        try:
            await worker.communicate(SimpleNamespace(), diagnostic=diagnostic)
        except WebSocketDisconnect as error:
            assert primary
            diagnostic.finish(error)
        else:
            assert not primary
            diagnostic.finish()

    asyncio.run(run())
    records = [r for r in caplog.records if isinstance(r.msg, dict)]
    assert [r.msg["event"] for r in records] == [
        "websocket_cleanup_failed",
        "websocket_finished",
    ]
    assert records[-1].msg["outcome"] == ("failed" if primary else "normal")
    if primary:
        assert records[-1].msg["close_code"] == 1011
    assert all("secret-" not in JsonLogFormatter().format(r) for r in records)
