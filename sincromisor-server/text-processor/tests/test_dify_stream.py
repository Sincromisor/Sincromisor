"""ローカルSSE配信でDifyの正常・異常・取消を確認する。"""

import asyncio
import json
import threading
import time
from collections.abc import AsyncGenerator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import ClassVar, Self

import aiohttp
import pytest
from fastapi import WebSocketDisconnect
from sincro_models import (
    ChatHistory,
    ChatMessage,
    TextProcessorRequest,
    TextProcessorResult,
)
from text_processor.Dify import DifyClient, DifyResponseError
from text_processor.TextProcessor import (
    DifyTextProcessorWorker,
    PokeTextProcessorWorker,
    TextProcessorWorker,
)


class _SSEHandler(BaseHTTPRequestHandler):
    events: ClassVar[list[dict[str, object]]] = []
    delay_seconds: ClassVar[float] = 0
    initial_delay_seconds: ClassVar[float] = 0
    wait_for_close: ClassVar[bool] = False
    status: ClassVar[int] = 200
    disconnected: ClassVar[threading.Event] = threading.Event()

    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(content_length)
        self.send_response(self.status)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        if self.status != 200:
            return
        try:
            if self.initial_delay_seconds:
                time.sleep(self.initial_delay_seconds)
            for event in self.events:
                self.wfile.write(f"data: {json.dumps(event)}\n\n".encode())
                self.wfile.flush()
                if self.delay_seconds:
                    time.sleep(self.delay_seconds)
            if self.wait_for_close:
                self.connection.settimeout(2)
                if self.connection.recv(1) == b"":
                    self.disconnected.set()
        except (BrokenPipeError, ConnectionResetError):
            self.disconnected.set()

    def log_message(self, format: str, *args: object) -> None:
        """模擬配信のアクセスログをテスト出力へ出さない。"""


class _SSEServer:
    def __init__(
        self,
        events: list[dict[str, object]],
        delay_seconds: float = 0,
        initial_delay_seconds: float = 0,
        wait_for_close: bool = False,
        status: int = 200,
    ) -> None:
        _SSEHandler.events = events
        _SSEHandler.delay_seconds = delay_seconds
        _SSEHandler.initial_delay_seconds = initial_delay_seconds
        _SSEHandler.wait_for_close = wait_for_close
        _SSEHandler.status = status
        _SSEHandler.disconnected = threading.Event()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _SSEHandler)
        self.thread = threading.Thread(target=self.server.serve_forever)

    def __enter__(self) -> Self:
        self.thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    @property
    def base_url(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}"


def _request(message: str = "質問") -> TextProcessorRequest:
    request_message = ChatMessage(
        speech_id=1,
        message_type="user",
        speaker_id="user",
        speaker_name="利用者",
        message=message,
    )
    return TextProcessorRequest(
        session_id="session",
        confirmed=True,
        history=ChatHistory(messages=[request_message]),
        request_message=request_message,
    )


async def _collect(
    worker: DifyTextProcessorWorker,
    request: TextProcessorRequest,
) -> list[TextProcessorResult]:
    return [
        result.model_copy(deep=True) async for result in worker.process_async(request)
    ]


async def _read_stream(client: DifyClient) -> None:
    """Difyイベントを終端まで読む。"""
    async for _ in client.chat({}, "質問", None):
        pass


def test_dify_stream_preserves_full_text_and_expression() -> None:
    """句読点の有無や10文超の配信でも、本文と音声入力を一度ずつ保つ。"""
    events = [
        {"event": "ping"},
        {"event": "message", "answer": "^", "conversation_id": "conversation"},
        {
            "event": "message",
            "answer": "2こんにちは。よ",
            "conversation_id": "conversation",
        },
        {"event": "message", "answer": "ろしくね", "conversation_id": "conversation"},
    ]
    events.append(
        {
            "event": "message",
            "answer": "".join(f"{index}。" for index in range(12)),
            "conversation_id": "conversation",
        },
    )
    events.append({"event": "message_end"})
    with _SSEServer(events) as server:
        worker = DifyTextProcessorWorker(server.base_url, "token")
        results = asyncio.run(_collect(worker, _request()))

    text_results = [result for result in results if result.voice_text]
    expected = "こんにちは。よろしくね" + "".join(f"{index}。" for index in range(12))
    assert "".join(result.voice_text for result in text_results) == expected
    assert results[-1].response_message.message == expected
    assert results[-1].response_message.expression_code == 2
    assert results[-1].end_of_response is True
    assert len(results[-1].history.messages) == 2


def test_dify_stream_flushes_unpunctuated_response_without_blocking_loop() -> None:
    """句読点のない末尾も送り、Dify待機中に同じイベントループを進める。"""
    events = [
        {"event": "message", "answer": "こんにちは", "conversation_id": "conversation"},
        {"event": "message_end"},
    ]
    with _SSEServer(events, initial_delay_seconds=0.2) as server:
        worker = DifyTextProcessorWorker(server.base_url, "token")

        async def collect_with_progress() -> list[TextProcessorResult]:
            results_task = asyncio.create_task(_collect(worker, _request()))
            progressed = asyncio.Event()

            async def advance() -> None:
                await asyncio.sleep(0.05)
                progressed.set()

            await asyncio.create_task(advance())
            assert progressed.is_set()
            assert not results_task.done()
            return await results_task

        results = asyncio.run(collect_with_progress())

    assert [result.voice_text for result in results] == ["こんにちは", None]
    assert results[-1].response_message.message == "こんにちは"


def test_dify_stream_finalizes_lone_expression_prefix_as_text() -> None:
    """感情コードにならない単独の`^`も、本文と音声入力から欠落させない。"""
    events = [
        {"event": "message", "answer": "^", "conversation_id": "conversation"},
        {"event": "message_end"},
    ]
    with _SSEServer(events) as server:
        results = asyncio.run(
            _collect(DifyTextProcessorWorker(server.base_url, "token"), _request()),
        )

    assert [result.voice_text for result in results] == ["^"]
    assert results[-1].response_message.message == "^"
    assert len(results[-1].history.messages) == 2


def test_poke_worker_uses_sync_process_adapter() -> None:
    """共有の非同期通信化後も、既存の同期sincro変換をそのまま送れる。"""
    result = asyncio.run(
        anext(PokeTextProcessorWorker().process_async(_request("こんにちは")))
    )
    assert result.voice_text == "こんにちは"


def test_dify_error_does_not_finalize_response() -> None:
    """Difyの異常通知は成功の最終結果へ変換せず、呼び出し元へ送る。"""
    with _SSEServer([{"event": "error"}]) as server:
        worker = DifyTextProcessorWorker(server.base_url, "token")
        try:
            asyncio.run(_collect(worker, _request()))
        except DifyResponseError:
            pass
        else:
            raise AssertionError("Dify error event must be propagated")


def test_dify_eof_and_http_error_are_propagated() -> None:
    """途中切断とHTTP失敗を、確定済み応答へ変換せず呼び出し元へ送る。"""
    with _SSEServer(
        [{"event": "message", "answer": "途中", "conversation_id": "conversation"}]
    ) as server:
        try:
            asyncio.run(
                _collect(DifyTextProcessorWorker(server.base_url, "token"), _request())
            )
        except DifyResponseError:
            pass
        else:
            raise AssertionError("EOF without message_end must be propagated")

    with _SSEServer([], status=500) as server:
        try:
            asyncio.run(_read_stream(DifyClient(server.base_url, "token")))
        except aiohttp.ClientResponseError:
            pass
        else:
            raise AssertionError("HTTP failure must be propagated")

    with (
        _SSEServer(
            [{"event": "message", "answer": "遅い", "conversation_id": "conversation"}],
            initial_delay_seconds=0.2,
        ) as server,
        pytest.raises(TimeoutError),
    ):
        asyncio.run(
            _read_stream(DifyClient(server.base_url, "token", timeout_seconds=0.05)),
        )


def test_dify_client_cancellation_closes_response() -> None:
    """HTTP読み取り待ちを取消しても、要求処理が待機し続けない。"""
    events = [
        {"event": "message", "answer": "最初。", "conversation_id": "conversation"}
    ]
    with _SSEServer(events, wait_for_close=True) as server:
        client = DifyClient(server.base_url, "token", timeout_seconds=2)

        async def read_once() -> None:
            stream = client.chat({}, "質問", None)
            try:
                await anext(stream)
                await anext(stream)
            finally:
                await stream.aclose()

        async def cancel() -> None:
            task = asyncio.create_task(read_once())
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            assert await asyncio.to_thread(_SSEHandler.disconnected.wait, 2)
            assert not (asyncio.all_tasks() - {asyncio.current_task()})

        asyncio.run(cancel())


def test_websocket_send_failure_closes_dify_stream() -> None:
    """送信失敗で通信処理を抜けると、進行中のDify配信も取消される。"""
    events = [
        {"event": "message", "answer": "応答。", "conversation_id": "conversation"},
        {"event": "message_end"},
    ]

    class FailingWebSocket:
        calls = 0

        async def receive_bytes(self) -> bytes:
            self.calls += 1
            if self.calls == 1:
                return _request().to_msgpack()
            await asyncio.Future()
            raise AssertionError("取消された受信処理は再開しない")

        async def send_bytes(self, _: bytes) -> None:
            raise RuntimeError("WebSocket send failed")

    with _SSEServer(events[:1], wait_for_close=True) as server:
        worker = DifyTextProcessorWorker(server.base_url, "token")

        async def fail_send() -> None:
            async with asyncio.timeout(3):
                with pytest.raises(RuntimeError, match="WebSocket send failed"):
                    await worker.communicate(FailingWebSocket())
                assert await asyncio.to_thread(_SSEHandler.disconnected.wait, 2)
                assert not (asyncio.all_tasks() - {asyncio.current_task()})

        asyncio.run(fail_send())


def test_websocket_disconnect_cancels_dify_read() -> None:
    """Difyが応答待ちでも、切断通知で処理を直ちに取り消す。"""

    class DisconnectingWebSocket:
        calls = 0

        async def receive_bytes(self) -> bytes:
            self.calls += 1
            if self.calls == 1:
                return _request().to_msgpack()
            if self.calls == 2:
                return _request("次の要求").to_msgpack()
            await asyncio.sleep(0.1)
            raise WebSocketDisconnect(code=1000)

        async def send_bytes(self, _: bytes) -> None:
            raise AssertionError("Difyは切断前に応答を返さない")

    with _SSEServer(
        [{"event": "message", "answer": "遅い。", "conversation_id": "conversation"}],
        initial_delay_seconds=1,
        wait_for_close=True,
    ) as server:

        async def disconnect() -> None:
            async with asyncio.timeout(3):
                with pytest.raises(WebSocketDisconnect):
                    await DifyTextProcessorWorker(server.base_url, "token").communicate(
                        DisconnectingWebSocket(),
                    )
                assert await asyncio.to_thread(_SSEHandler.disconnected.wait, 2)
                assert not (asyncio.all_tasks() - {asyncio.current_task()})

        asyncio.run(disconnect())


def test_parent_cancellation_releases_child_processes() -> None:
    """親処理の取消後には、同じイベントループ内で子処理も終了する。"""
    released = asyncio.Event()

    class WaitingWorker(TextProcessorWorker):
        async def process_async(
            self,
            request: TextProcessorRequest,
        ) -> AsyncGenerator[TextProcessorResult, None]:
            try:
                await asyncio.Event().wait()
                if request.confirmed:
                    yield TextProcessorResult.from_request(
                        message_type=self.message_type,
                        speaker_id=self.speaker_id,
                        speaker_name=self.speaker_name,
                        request=request,
                    )
            finally:
                released.set()

    class WaitingWebSocket:
        calls = 0

        async def receive_bytes(self) -> bytes:
            self.calls += 1
            if self.calls == 1:
                return _request().to_msgpack()
            await asyncio.Event().wait()
            raise AssertionError("取消された受信処理は再開しない")

        async def send_bytes(self, _: bytes) -> None:
            raise AssertionError("応答は生成されない")

    async def cancel_parent() -> None:
        task = asyncio.create_task(WaitingWorker().communicate(WaitingWebSocket()))
        await asyncio.sleep(0.05)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert released.is_set()

    asyncio.run(cancel_parent())
