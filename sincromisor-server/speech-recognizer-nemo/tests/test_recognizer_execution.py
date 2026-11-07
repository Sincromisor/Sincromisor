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

    def recognize(self, request):
        assert threading.get_ident() == self.thread
        assert self.decoding == "default"
        self.calls.append(request.session_id)
        self.started.set()
        self.decoding = "temporary"
        try:
            assert self.release.wait(3)
            if request.session_id == "failure":
                raise ValueError("decode failed")
            return request.session_id, None
        finally:
            self.decoding = "default"


def test_serial_execution_cancellation_and_failure(caplog):
    caplog.set_level(logging.INFO, logger="sincro.RecognizerExecution")

    async def run():
        execution = RecognizerExecution(Worker)
        worker = execution.worker
        try:
            running = asyncio.create_task(
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="first")
                )
            )
            async with asyncio.timeout(3):
                while not worker.started.is_set():
                    await asyncio.sleep(0.001)
            queued = asyncio.create_task(
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="cancelled")
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
                    SpeechExtractorResult(start_at=0, session_id="failure")
                )
            assert await asyncio.gather(
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="second")
                ),
                execution.recognize(
                    SpeechExtractorResult(start_at=0, session_id="third")
                ),
            ) == ["second", "third"]
            assert worker.calls == ["first", "failure", "second", "third"]
        finally:
            worker.release.set()
            execution.close()
        assert execution.worker is None
        with pytest.raises(RuntimeError, match="closed"):
            await execution.recognize(
                SpeechExtractorResult(start_at=0, session_id="late")
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
        def recognize(self, request):
            if fail:
                raise ValueError("private-error")
            return "private-result", None

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
                    await execution.recognize(request)
            else:
                assert await execution.recognize(request) == "private-result"
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


def test_capacity_retains_cancelled_queue_slots_and_releases_audio(monkeypatch):
    import gc
    import weakref

    async def run():
        execution = RecognizerExecution(Worker, max_pending=2)
        worker = execution.worker
        first = asyncio.create_task(
            execution.recognize(SpeechExtractorResult(session_id="running", start_at=0))
        )
        try:
            assert await asyncio.to_thread(worker.started.wait, 2)
            queued_request = SpeechExtractorResult(session_id="queued", start_at=0)
            reference = weakref.ref(queued_request)
            queued = asyncio.create_task(execution.recognize(queued_request))
            await asyncio.sleep(0)
            queued.cancel()
            with pytest.raises(asyncio.CancelledError):
                await queued
            del queued_request, queued
            await asyncio.sleep(0)
            gc.collect()
            assert reference() is None
            # 取消済み項目を実行器が回収するまで、再投入で内部キューを膨らませない。
            with pytest.raises(RuntimeError, match="capacity"):
                await execution.recognize(
                    SpeechExtractorResult(session_id="full", start_at=0)
                )
            worker.release.set()
            assert await first == "running"
            await asyncio.to_thread(execution.executor.submit(lambda: None).result)
            with monkeypatch.context() as context:
                context.setattr(
                    execution.executor,
                    "submit",
                    lambda *a: (_ for _ in ()).throw(RuntimeError("submit failed")),
                )
                with pytest.raises(RuntimeError, match="submit failed"):
                    await execution.recognize(
                        SpeechExtractorResult(session_id="rejected", start_at=0)
                    )
            assert (
                await execution.recognize(
                    SpeechExtractorResult(session_id="later", start_at=0)
                )
                == "later"
            )
            assert worker.calls == ["running", "later"]
        finally:
            worker.release.set()
            await asyncio.gather(first, return_exceptions=True)
            execution.close()

    asyncio.run(run())
