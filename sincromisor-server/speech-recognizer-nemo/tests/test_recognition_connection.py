"""推論中の切断と接続境界の上限を、固定MessagePackと実行器で確認する。"""

import asyncio
import logging

import pytest
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from speech_recognizer_nemo import recognition_connection
from speech_recognizer_nemo.recognition_connection import recognize_connection
from speech_recognizer_nemo.recognizer_execution import RecognizerExecution
from starlette.websockets import WebSocketDisconnect
from test_recognition_storage import request, result
from test_recognizer_execution import Worker


def diagnostic():
    return WebSocketDiagnostics(logging.getLogger("test.connection"))


@pytest.mark.parametrize("empty_frame", [False, True])
def test_disconnect_cancels_running_recognition_and_waits_for_model(empty_frame):
    async def run():
        execution = RecognizerExecution(Worker)
        worker = execution.worker
        disconnected = asyncio.Event()
        diag = diagnostic()

        class Socket:
            first = True

            async def receive_bytes(self):
                if self.first:
                    self.first = False
                    return request(confirmed=False).to_msgpack()
                assert await asyncio.to_thread(worker.started.wait, 2)
                disconnected.set()
                if empty_frame:
                    return b""
                raise WebSocketDisconnect(1000)

            async def send_bytes(self, pack):
                pytest.fail("disconnected request must not send")

        connection = asyncio.create_task(
            recognize_connection(Socket(), execution, diag)
        )
        try:
            await asyncio.wait_for(disconnected.wait(), 2)
            await asyncio.sleep(0)
            assert not connection.done()
            worker.release.set()
            if empty_frame:
                await connection
                assert diag.error is None
            else:
                with pytest.raises(ExceptionGroup):
                    await connection
                assert isinstance(diag.error, WebSocketDisconnect)
                assert diag.failure["operation"] == "receive"
            assert worker.decoding == "default"
        finally:
            worker.release.set()
            await asyncio.gather(connection, return_exceptions=True)
            execution.close()

    asyncio.run(run())


@pytest.mark.parametrize("failure", ["oversize", "queue", "send"])
def test_connection_bounds(monkeypatch, failure):
    monkeypatch.setattr(recognition_connection, "SEND_TIMEOUT_SECONDS", 0.01)

    async def run():
        blocker = asyncio.Event()
        calls = []
        diag = diagnostic()

        class Execution:
            async def recognize(self, spe_result):
                calls.append(spe_result)
                if failure == "queue":
                    await blocker.wait()
                return result(spe_result)

        class Socket:
            first = True

            async def receive_bytes(self):
                if failure == "oversize":
                    return b"x" * (recognition_connection.MAX_REQUEST_BYTES + 1)
                if self.first or failure == "queue":
                    self.first = False
                    return request(confirmed=False).to_msgpack()
                await blocker.wait()
                return b""

            async def send_bytes(self, pack):
                await blocker.wait()

        with pytest.raises(ExceptionGroup):
            await asyncio.wait_for(recognize_connection(Socket(), Execution(), diag), 2)
        if failure == "oversize":
            assert not calls
            assert isinstance(diag.error, ValueError)
        elif failure == "queue":
            assert isinstance(diag.error, asyncio.QueueFull)
        else:
            assert isinstance(diag.error, TimeoutError)
            assert diag.failure["operation"] == "send"

    asyncio.run(run())
