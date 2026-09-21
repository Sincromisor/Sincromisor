"""実HTTPイベントの再生とローカル配信で本文・終端・接続取消を確認する。"""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
import pytest
from fastapi import WebSocketDisconnect
from pydantic import ValidationError
from sincro_models import (
    ChatHistory,
    ChatMessage,
    TextProcessorRequest,
    TextProcessorResult,
)
from text_processor.mastra_client import MastraClient, MastraResponseError
from text_processor.mastra_worker import MastraTextProcessorWorker
from text_processor.TextProcessor import PokeTextProcessorWorker

FIXTURES = (
    Path(__file__).parents[3]
    / "tasks/backend/task-260915031110-mastra-studio-session-memory/acceptance"
)


def _event(kind: str, payload: dict[str, object] | None = None) -> bytes:
    return f"data: {json.dumps({'type': kind, 'payload': payload or {}})}\n\n".encode()


FINISH = _event("finish", {"stepResult": {"reason": "stop", "isContinued": False}})
DONE = b"data: [DONE]\n\n"


def _request(message_text: str = "新しい質問") -> TextProcessorRequest:
    message = ChatMessage(
        speech_id=1,
        message_type="user",
        speaker_id="user",
        speaker_name="利用者",
        message=message_text,
    )
    previous = message.model_copy(update={"message": "表示だけの履歴"})
    return TextProcessorRequest(
        session_id="session-a",
        confirmed=True,
        history=ChatHistory(messages=[previous, message]),
        request_message=message,
    )


@asynccontextmanager
async def _server(
    chunks: list[bytes],
    *,
    hold: bool = False,
    interval: float = 0,
    status: int = 200,
) -> AsyncIterator[tuple[str, list[dict[str, object]], asyncio.Event]]:
    requests: list[dict[str, object]] = []
    disconnected = asyncio.Event()
    handlers: set[asyncio.Task[None]] = set()

    async def handle(
        reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            headers = (await reader.readuntil(b"\r\n\r\n")).decode()
            size = next(
                int(line.split(":", 1)[1])
                for line in headers.splitlines()
                if line.lower().startswith("content-length:")
            )
            requests.append(json.loads(await reader.readexactly(size)))
            assert headers.startswith(
                "POST /api/agents/sincromisor-character/stream HTTP/1.1"
            )
            assert "Authorization: Bearer test-token" in headers
            writer.write(
                f"HTTP/1.1 {status} Test\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".encode()
            )
            await writer.drain()
            for chunk in chunks:
                await asyncio.sleep(interval)
                writer.write(chunk)
                await writer.drain()
            if hold:
                assert await reader.read() == b""
                disconnected.set()
        finally:
            writer.close()
            await writer.wait_closed()

    def connected(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        handlers.add(asyncio.create_task(handle(reader, writer)))

    server = await asyncio.start_server(connected, "127.0.0.1", 0)
    try:
        yield (
            f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
            requests,
            disconnected,
        )
    finally:
        server.close()
        await server.wait_closed()
        for task in handlers:
            if not task.done():
                task.cancel()
        results = await asyncio.gather(*handlers, return_exceptions=True)
        for result in results:
            if isinstance(result, BaseException) and not isinstance(
                result, asyncio.CancelledError
            ):
                raise result


def test_text_expression_steps_and_thread_mapping() -> None:
    """分割表情、10文超、末尾、ツール通知を扱い、新しい発話だけを同じthreadへ送る。"""
    chunks = [
        b": heartbeat\n\n",
        _event("text-delta", {"text": "^"}),
        _event("tool-call", {"args": {"secret": "読み上げない"}}),
        _event("reasoning-delta", {"text": "考え中"}),
        _event("step-finish"),
        _event("tool-result", {"result": "読み上げない"}),
        _event("text-delta", {"text": "2こんにちは。" + "次。" * 12 + "末尾"}),
        FINISH,
        DONE,
    ]

    async def run() -> None:
        async with _server(chunks) as (url, requests, _):
            worker = MastraTextProcessorWorker(
                url, "test-token", "sincromisor-character"
            )
            for _ in range(2):
                results = [
                    result.model_copy(deep=True)
                    async for result in worker.process_async(_request())
                ]
                expected = "こんにちは。" + "次。" * 12 + "末尾"
                assert (
                    "".join(result.voice_text or "" for result in results) == expected
                )
                assert results[-1].response_message.message == expected
                assert results[-1].response_message.expression_code == 2
                assert sum(result.end_of_response for result in results) == 1
                assert len(results[-1].history.messages) == 3
            assert (
                requests
                == [
                    {
                        "messages": [{"role": "user", "content": "新しい質問"}],
                        "memory": {
                            "resource": "sincromisor-local",
                            "thread": "sincromisor:session-a",
                        },
                    }
                ]
                * 2
            )

    asyncio.run(run())


def test_poke_worker_uses_sync_process_adapter() -> None:
    """Mastra切替後も、sincroの同期変換は既存の非同期入口で送信できる。"""

    async def run() -> None:
        result = await anext(
            PokeTextProcessorWorker().process_async(_request("こんにちは"))
        )
        assert result.voice_text == "こんにちは"

    asyncio.run(run())


@pytest.mark.parametrize("name", ["normal", "length", "error"])
def test_recorded_http_events(name: str) -> None:
    """実Gemmaから採取したイベントを再生し、正常時だけ確定する。"""

    async def run() -> None:
        results = []
        async with _server([FIXTURES.joinpath(f"{name}.sse").read_bytes()]) as (
            url,
            _,
            _,
        ):
            worker = MastraTextProcessorWorker(
                url, "test-token", "sincromisor-character"
            )
            try:
                async for result in worker.process_async(_request()):
                    results.append(result.model_copy(deep=True))
            except MastraResponseError:
                assert name != "normal"
            else:
                assert name == "normal"
            assert any(result.end_of_response for result in results) == (
                name == "normal"
            )

    asyncio.run(run())


@pytest.mark.parametrize(
    "ending",
    [
        [],
        [FINISH],
        [DONE],
        [_event("step-finish"), DONE],
        [_event("abort"), FINISH, DONE],
        [_event("error", {"error": "private"}), DONE],
        [
            _event(
                "finish", {"stepResult": {"reason": "length", "isContinued": False}}
            ),
            DONE,
        ],
        [
            _event("finish", {"stepResult": {"reason": "stop", "isContinued": True}}),
            DONE,
        ],
        [_event("finish"), DONE],
        [_event("text-delta")],
        [_event("text-delta", {"text": 123})],
        [b"data: invalid-secret\n\n"],
        [FINISH, _event("text-delta", {"text": "extra"}), DONE],
    ],
)
def test_invalid_stream_never_finalizes(ending: list[bytes], caplog) -> None:
    """不正入力・早期EOF・中断は、配信済みの途中本文を成功へ変えない。"""
    caplog.set_level("INFO", logger="sincro.MastraClient")

    async def run() -> None:
        async with _server([_event("text-delta", {"text": "途中。"}), *ending]) as (
            url,
            _,
            _,
        ):
            worker = MastraTextProcessorWorker(
                url, "test-token", "sincromisor-character"
            )

            async def consume() -> None:
                async for result in worker.process_async(_request()):
                    assert not result.end_of_response

            with pytest.raises((MastraResponseError, ValidationError)) as error:
                await consume()
            assert "invalid-secret" not in str(error.value)
            assert "private" not in str(error.value)

    asyncio.run(run())
    events = [
        record.msg for record in caplog.records if record.name == "sincro.MastraClient"
    ]
    assert events[-1]["outcome"] == "failed"
    assert events[-1]["stage"] == "stream"
    assert "invalid-secret" not in str(events)
    assert "private" not in str(events)
    if not ending:
        assert events[-1]["reason"] == "unexpected_eof"


def test_timeout_http_failure_and_long_tool_wait(caplog) -> None:
    """無受信・HTTP失敗を伝え、通知が続くツール待ちを総時間では打ち切らない。"""
    caplog.set_level("INFO", logger="sincro.MastraClient")

    async def read(url: str) -> list[str]:
        return [
            text
            async for text in MastraClient(
                url, "test-token", "sincromisor-character", timeout_seconds=0.05
            ).chat("質問", "session")
        ]

    async def run() -> None:
        async with _server([], status=503) as (url, _, _):
            with pytest.raises(aiohttp.ClientResponseError):
                await read(url)
        async with _server([], hold=True) as (url, _, disconnected):
            with pytest.raises(TimeoutError):
                await read(url)
            await asyncio.wait_for(disconnected.wait(), 1)
        async with _server(
            [_event("tool-call")] * 5
            + [_event("text-delta", {"text": "^"}), FINISH, DONE],
            interval=0.02,
        ) as (url, _, _):
            assert await read(url) == ["^"]

    asyncio.run(run())
    events = [
        record.msg for record in caplog.records if record.name == "sincro.MastraClient"
    ]
    assert events[0]["http_status"] == 503
    assert events[0]["stage"] == "http"
    assert events[1]["reason"] == "timeout"
    assert events[2]["outcome"] == "success"


@pytest.mark.parametrize("failure", ["disconnect", "send", "cancel"])
def test_websocket_failure_closes_http(failure: str) -> None:
    """WebSocketの受信・送信失敗と親取消のいずれでもHTTP切断まで待つ。"""

    async def run() -> None:
        sent = asyncio.Event()

        class WebSocket:
            calls = 0

            async def receive_bytes(self) -> bytes:
                self.calls += 1
                if self.calls == 1:
                    return _request().to_msgpack()
                await sent.wait()
                if failure == "disconnect":
                    raise WebSocketDisconnect(code=1000)
                await asyncio.Future()
                raise AssertionError("取消後は受信しない")

            async def send_bytes(self, _: bytes) -> None:
                sent.set()
                if failure == "send":
                    raise RuntimeError("send failed")

        async with _server([_event("text-delta", {"text": "途中。"})], hold=True) as (
            url,
            _,
            disconnected,
        ):
            worker = MastraTextProcessorWorker(
                url, "test-token", "sincromisor-character"
            )
            task = asyncio.create_task(worker.communicate(WebSocket()))
            await asyncio.wait_for(sent.wait(), 1)
            if failure == "cancel":
                task.cancel()
            with pytest.raises(
                (WebSocketDisconnect, RuntimeError, asyncio.CancelledError)
            ):
                await asyncio.wait_for(task, 1)
            await asyncio.wait_for(disconnected.wait(), 1)

    asyncio.run(run())


@pytest.mark.parametrize("enabled", ["true", "false"])
@pytest.mark.parametrize("outcome", ["success", "failed", "cancelled"])
@pytest.mark.parametrize("engine", ["poke", "mastra"])
def test_conversation_logs(monkeypatch, caplog, enabled, outcome, engine):
    """本文スイッチは出力だけに作用し、送信失敗・取消は確定にならない。"""
    monkeypatch.setenv("SINCRO_LOG_CONVERSATION_ENABLED", enabled)
    if engine == "poke":
        monkeypatch.setattr(
            PokeTextProcessorWorker.pokeText, "convert", lambda text: iter([text])
        )
        worker = PokeTextProcessorWorker()
    else:

        async def chat(*args):
            yield "新しい質問"

        monkeypatch.setattr(MastraClient, "chat", chat)
        worker = MastraTextProcessorWorker("http://unused", "test-token", "agent")
    caplog.set_level("INFO", logger=worker.logger.name)
    sent = []

    class Socket:
        received = False
        complete = asyncio.Event()

        async def receive_bytes(self):
            if not self.received:
                self.received = True
                return _request().to_msgpack()
            await self.complete.wait()
            raise WebSocketDisconnect

        async def send_bytes(self, pack):
            if outcome == "failed":
                raise RuntimeError("新しい質問")
            if outcome == "cancelled":
                raise asyncio.CancelledError
            sent.append(pack)
            if TextProcessorResult.from_msgpack(pack).end_of_response:
                self.complete.set()

    async def run():
        try:
            await worker.communicate(Socket())
        except RuntimeError, asyncio.CancelledError, WebSocketDisconnect:
            pass

    asyncio.run(run())
    events = [
        record.msg for record in caplog.records if record.name == worker.logger.name
    ]
    content = [event for event in events if "text" in event]
    assert all("表示だけの履歴" not in str(event) for event in events)
    assert events[-1]["outcome"] == outcome
    if enabled == "false":
        assert not content
        assert "新しい質問" not in str(events)
    else:
        assert content[0]["event"] == "conversation_input"
        if outcome == "success":
            assert [event["event"] for event in content] == [
                "conversation_input",
                "conversation_fragment",
                "conversation_final",
            ]
            assert content[-1]["confirmed"] is True
        else:
            assert not any(event["event"] == "conversation_final" for event in content)
    assert bool(sent) == (outcome == "success")
