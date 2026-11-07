"""有限実行器の取消・満杯・終了回収を確認する。"""

import asyncio
import threading

import pytest
from speech_extractor.model_execution import ModelExecution


def test_queued_cancellation_and_bounded_execution():
    async def run():
        execution = ModelExecution("bounded", capacity=2)
        started, release = threading.Event(), threading.Event()
        called = []

        def blocking():
            called.append("running")
            started.set()
            assert release.wait(3)

        running = asyncio.create_task(execution.run(blocking))
        try:
            async with asyncio.timeout(2):
                while not started.is_set():
                    await asyncio.sleep(0.001)
            queued = asyncio.create_task(execution.run(lambda: called.append("queued")))
            await asyncio.sleep(0)
            with pytest.raises(RuntimeError, match="capacity"):
                await execution.run(lambda: None)
            queued.cancel()
            with pytest.raises(asyncio.CancelledError):
                await queued
            running.cancel()
            with pytest.raises(asyncio.CancelledError):
                await running
            assert execution.pending == 1
            assert called == ["running"]
        finally:
            release.set()
            execution.close()
        assert execution.pending == 0
        assert called == ["running"]

    asyncio.run(run())


def test_close_waits_for_started_job():
    execution = ModelExecution("closing")
    started, release, closed = threading.Event(), threading.Event(), threading.Event()

    def blocking():
        started.set()
        assert release.wait(3)

    pending = execution.executor.submit(blocking)
    assert started.wait(2)

    def close():
        execution.close()
        closed.set()

    thread = threading.Thread(target=close)
    thread.start()
    try:
        assert not closed.wait(0.05)
    finally:
        release.set()
        thread.join(2)
    assert closed.is_set()
    pending.result()
