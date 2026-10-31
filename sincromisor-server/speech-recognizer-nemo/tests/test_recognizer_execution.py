"""認識スレッドの取消と、保存資源を解放できる時点を確認する。"""

import asyncio
import logging
import threading

import pytest
from sincro_models import SpeechExtractorResult
from speech_recognizer_nemo import recognizer_execution
from speech_recognizer_nemo.recognizer_execution import RecognizerExecution


class Worker:
    def __init__(self):
        self.thread = threading.get_ident()
        self.started = threading.Event()
        self.release = threading.Event()
        self.calls = []
        self.decoding = "default"

    def recognize(self, request, client):
        assert threading.get_ident() == self.thread
        assert self.decoding == "default"
        assert not client.closed
        self.calls.append(request.session_id)
        self.started.set()
        self.decoding = "temporary"
        try:
            assert self.release.wait(3)
            assert not client.closed
            if request.session_id == "failure":
                raise ValueError("decode failed")
            return request.session_id
        finally:
            self.decoding = "default"


def test_serial_execution_cancellation_and_failure(caplog):
    caplog.set_level(logging.INFO, logger="sincro.RecognizerExecution")

    async def run():
        execution = RecognizerExecution(Worker)
        worker = execution.worker
        client = type("Client", (), {"closed": False})()
        try:
            running = asyncio.create_task(
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="first"), client
                )
            )
            async with asyncio.timeout(3):
                while not worker.started.is_set():
                    await asyncio.sleep(0.001)
            queued = asyncio.create_task(
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="cancelled"), client
                )
            )
            await asyncio.sleep(0)
            queued.cancel()
            with pytest.raises(asyncio.CancelledError):
                await queued
            running.cancel()
            await asyncio.sleep(0)
            running.cancel()
            await asyncio.sleep(0)
            assert not running.done()
            worker.release.set()
            with pytest.raises(asyncio.CancelledError):
                await running
            assert worker.decoding == "default"
            with pytest.raises(ValueError, match="decode failed"):
                await execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="failure"), client
                )
            assert await asyncio.gather(
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="second"), client
                ),
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="third"), client
                ),
            ) == ["second", "third"]
            assert worker.calls == ["first", "failure", "second", "third"]
            client.closed = True
        finally:
            worker.release.set()
            execution.close()
        assert execution.worker is None
        with pytest.raises(RuntimeError, match="closed"):
            await execution.recognize(
                SpeechExtractorResult(start_at=0, session_id="late"), client
            )

    asyncio.run(run())

    rows = [r.msg for r in caplog.records if r.name == "sincro.RecognizerExecution"]
    assert [r["session_id"] for r in rows] == ["first", "failure", "second", "third"]
    assert [r["outcome"] for r in rows] == ["success", "failed", "success", "success"]


@pytest.mark.parametrize("fail", [False, True])
def test_wait_and_execution_timing(monkeypatch, caplog, fail):
    caplog.set_level(logging.INFO, logger="sincro.RecognizerExecution")
    ticks = iter([10.0, 12.0, 15.0])
    monkeypatch.setattr(recognizer_execution, "perf_counter", lambda: next(ticks))

    class TimedWorker:
        def recognize(self, request, client):
            if fail:
                raise ValueError("private-error")
            return "private-result"

    async def run():
        execution = RecognizerExecution(TimedWorker)
        try:
            request = SpeechExtractorResult(
                session_id="timing",
                start_at=0,
                speech_id=2,
                sequence_id=3,
                confirmed=True,
            )
            if fail:
                with pytest.raises(ValueError, match="private-error"):
                    await execution.recognize(request, None)
            else:
                assert await execution.recognize(request, None) == "private-result"
        finally:
            execution.close()

    asyncio.run(run())
    rows = [r.msg for r in caplog.records if r.name == "sincro.RecognizerExecution"]
    assert rows == [
        {
            "event": "recognition_execution",
            "session_id": "timing",
            "speech_id": 2,
            "sequence_id": 3,
            "confirmed": True,
            "queue_wait_ms": 2000.0,
            "execution_ms": 3000.0,
            "outcome": "failed" if fail else "success",
        }
    ]
