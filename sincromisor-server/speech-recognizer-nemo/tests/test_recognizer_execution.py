"""認識スレッドの取消と、保存資源を解放できる時点を確認する。"""

import asyncio
import threading

import pytest
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
        self.calls.append(request)
        self.started.set()
        self.decoding = "temporary"
        try:
            assert self.release.wait(3)
            assert not client.closed
            if request == "failure":
                raise ValueError("decode failed")
            return request
        finally:
            self.decoding = "default"


def test_serial_execution_cancellation_and_failure():
    async def run():
        execution = RecognizerExecution(Worker)
        worker = execution.worker
        client = type("Client", (), {"closed": False})()
        try:
            running = asyncio.create_task(execution.recognize("first", client))
            async with asyncio.timeout(3):
                while not worker.started.is_set():
                    await asyncio.sleep(0.001)
            queued = asyncio.create_task(execution.recognize("cancelled", client))
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
                await execution.recognize("failure", client)
            assert await asyncio.gather(
                execution.recognize("second", client),
                execution.recognize("third", client),
            ) == ["second", "third"]
            assert worker.calls == ["first", "failure", "second", "third"]
            client.closed = True
        finally:
            worker.release.set()
            execution.close()
        assert execution.worker is None
        with pytest.raises(RuntimeError, match="closed"):
            await execution.recognize("late", client)

    asyncio.run(run())
