"""実Uvicornと実ワーカーで、要求滞留後の全件返却と監視再開を比較する。"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from sincro_models import TextProcessorResult, VoiceSynthesizerChunk
from uvicorn import Config, Server
from uvicorn.protocols.websockets.websockets_sansio_impl import WebSocketsSansIOProtocol
from voice_synthesizer.backpressure_websocket import BackpressureWebSocketProtocol
from voice_synthesizer.VoiceSynthesizer import VoiceSynthesizerWorker
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed
from websockets.frames import Frame, Opcode

FIXTURES = Path(__file__).parents[2] / "sincro-rtc/internal/pipeline/protocol/testdata"


@asynccontextmanager
async def serve_worker(monkeypatch, protocol_class):
    state = SimpleNamespace(
        protocol=None,
        queued=asyncio.Event(),
        pong=asyncio.Event(),
        ping_received=asyncio.Event(),
        timeout_paused=None,
        generated=[],
        closed=Mock(),
    )

    class ObservedProtocol(protocol_class):
        def send_receive_event_to_app(self):
            super().send_receive_event_to_app()
            state.protocol = self
            if self.queue.qsize() >= 2:
                state.queued.set()

        def handle_pong(self, event):
            pending = self.pending_ping_payload
            super().handle_pong(event)
            if pending is not None and bytes(event.data) == pending:
                state.pong.set()

        def keepalive_timeout(self):
            state.timeout_paused = self.read_paused
            super().keepalive_timeout()

    def stream_voice(vs_request, context):
        time.sleep(0.12)
        state.generated.append(vs_request.speech_id)
        yield VoiceSynthesizerChunk(
            request_id=context.request_id,
            speech_id=vs_request.speech_id,
            sequence=0,
            sample_offset=0,
            final=False,
            pcm=b"\0\1",
            message="人工音声",
            mora_queue=[],
        )

    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceSynthesizerWorker")
    monkeypatch.setattr(
        module,
        "VoiceCacheManager",
        lambda **kwargs: SimpleNamespace(stream_voice=stream_voice, close=state.closed),
    )
    app = FastAPI()

    @app.websocket("/ws")
    async def endpoint(ws: WebSocket):
        await ws.accept()
        worker = VoiceSynthesizerWorker(
            "unused", 1, 3, "unused", 1, "unused", 1, "fixture", "fixture"
        )
        try:
            await worker.communicate(ws)
        except WebSocketDisconnect:
            pass  # 比較対象の誤切断も、ワーカーの既存診断経路を通して終了する。
        finally:
            worker.close()

    server = Server(
        Config(
            app,
            host="127.0.0.1",
            port=0,
            ws=ObservedProtocol,
            ws_ping_interval=0.15,
            ws_ping_timeout=0.15,
            log_config=None,
            lifespan="off",
            timeout_graceful_shutdown=3,
        )
    )
    serving = asyncio.create_task(server.serve())
    try:
        async with asyncio.timeout(5):
            while not server.started:
                if serving.done():
                    await serving
                await asyncio.sleep(0.01)
        state.url = f"ws://127.0.0.1:{server.servers[0].sockets[0].getsockname()[1]}/ws"
        yield state
    finally:
        server.should_exit = True
        await asyncio.wait_for(serving, 5)


async def exchange(state, *, corrected):
    class ObservedClient(ClientConnection):
        def process_event(self, event):
            super().process_event(event)
            if isinstance(event, Frame) and event.opcode == Opcode.PING:
                state.ping_received.set()

    received = []

    async def receive_until_closed(ws):
        while True:
            received.append(await ws.recv())

    async with connect(
        state.url, ping_interval=None, create_connection=ObservedClient
    ) as ws:
        for speech_id in range(8):
            request = TextProcessorResult.from_msgpack(
                (FIXTURES / "text_processor_result.msgpack").read_bytes()
            )
            request.response_message.speech_id = speech_id
            request.voice_text = "人工音声"
            await ws.send(request.to_msgpack())
        await asyncio.wait_for(state.queued.wait(), 2)
        if not corrected:
            with pytest.raises(ConnectionClosed) as error:
                await receive_until_closed(ws)
            assert error.value.rcvd.code == 1011
            assert error.value.rcvd.reason == "keepalive ping timeout"
            assert state.timeout_paused is True
            assert state.ping_received.is_set()
            assert not state.pong.is_set()
            assert len(received) < 8
            return
        for _ in range(8):
            result = VoiceSynthesizerChunk.from_msgpack(await ws.recv())
            received.append(result.speech_id)
        assert received == state.generated == list(range(8))
        assert not state.protocol.read_paused
        assert state.protocol.queue.empty()
        state.pong.clear()
        state.ping_received.clear()
        await asyncio.wait_for(state.pong.wait(), 2)
        assert state.ping_received.is_set()
        assert state.timeout_paused is None
        assert state.protocol.pending_ping_payload is None
        assert state.protocol.pong_timer is None
        assert state.protocol.ping_timer is not None
        # 監視再開後にも余分な結果が届かず、接続が生きていることを確認する。
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(ws.recv(), 0.2)


@pytest.mark.parametrize("corrected", [False, True])
def test_real_worker_backlog_keepalive(monkeypatch, caplog, corrected):
    caplog.set_level(logging.INFO)

    async def run():
        protocol_class = (
            BackpressureWebSocketProtocol if corrected else WebSocketsSansIOProtocol
        )
        async with asyncio.timeout(10):
            async with serve_worker(monkeypatch, protocol_class) as state:
                await exchange(state, corrected=corrected)
            assert state.protocol.disconnected
            assert state.protocol.ping_timer is state.protocol.pong_timer is None
            assert state.protocol.pending_ping_payload is None
            assert not state.protocol.tasks
            assert not state.protocol.connections
            state.closed.assert_called_once()

    asyncio.run(run())
    if corrected:
        deliveries = [
            record.msg
            for record in caplog.records
            if isinstance(record.msg, dict)
            and record.msg.get("event") == "synthesis_delivery"
        ]
        assert [row["speech_id"] for row in deliveries] == list(range(8))
        assert all(row["outcome"] == "success" for row in deliveries)
