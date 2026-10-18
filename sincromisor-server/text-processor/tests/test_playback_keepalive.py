"""RTCの結果受信が再生待ちで止まっても、文章処理接続を誤切断しないことを確認する。"""

import ast
import asyncio
from pathlib import Path

import pytest
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from uvicorn import Config, Server
from uvicorn.protocols.websockets.websockets_sansio_impl import WebSocketsSansIOProtocol
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed


def process_ping_timeout():
    """Consulを起動せず、本番入口がuvicorn.runへ渡す値で通信試験を組み立てる。"""
    path = Path(__file__).parents[1] / "TextProcessorProcess.py"
    tree = ast.parse(path.read_text())
    call = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "uvicorn"
        and node.func.attr == "run"
    )
    return next(
        (
            ast.literal_eval(arg.value)
            for arg in call.keywords
            if arg.arg == "ws_ping_timeout"
        ),
        20,
    )


@pytest.mark.parametrize("corrected", [False, True])
def test_delayed_pong_resumes_without_closing(corrected):
    async def run():
        observed = asyncio.Event()
        pong = asyncio.Event()
        protocols = []

        class ObservedProtocol(WebSocketsSansIOProtocol):
            sent = 0
            timed_out = False

            def send_keepalive_ping(self):
                super().send_keepalive_ping()
                self.sent += 1
                if self.sent >= 3:
                    observed.set()

            def handle_pong(self, event):
                super().handle_pong(event)
                pong.set()

            def keepalive_timeout(self):
                self.timed_out = True
                super().keepalive_timeout()
                observed.set()

            def connection_made(self, transport):
                super().connection_made(transport)
                protocols.append(self)

        app = FastAPI()

        @app.websocket("/ws")
        async def endpoint(ws: WebSocket):
            await ws.accept()
            try:
                while True:
                    await ws.send_bytes(await ws.receive_bytes())
            except WebSocketDisconnect:
                pass  # 比較用の旧設定ではPong期限による切断を正常な検証結果として扱う。

        timeout = process_ping_timeout() if corrected else 0.05
        if corrected:
            assert timeout is None
        server = Server(
            Config(
                app,
                host="127.0.0.1",
                port=0,
                ws=ObservedProtocol,
                ws_ping_interval=0.05,
                ws_ping_timeout=timeout,
                log_config=None,
                lifespan="off",
                timeout_graceful_shutdown=1,
            )
        )
        serving = asyncio.create_task(server.serve())
        try:
            async with asyncio.timeout(3):
                while not server.started:
                    if serving.done():
                        await serving
                    await asyncio.sleep(0.01)
            port = server.servers[0].sockets[0].getsockname()[1]
            async with connect(f"ws://127.0.0.1:{port}/ws", ping_interval=None) as ws:
                # GoのreadLoopが結果配送で待ち、制御フレームも読めない状態を再現する。
                ws.transport.pause_reading()
                try:
                    await asyncio.wait_for(observed.wait(), 2)
                finally:
                    ws.transport.resume_reading()
                if corrected:
                    assert not protocols[0].timed_out
                    await asyncio.wait_for(pong.wait(), 1)
                    await ws.send(b"continued")
                    assert await asyncio.wait_for(ws.recv(), 1) == b"continued"
                else:
                    with pytest.raises(ConnectionClosed) as error:
                        await ws.recv()
                    assert error.value.rcvd is not None
                    assert error.value.rcvd.code == 1011
        finally:
            server.should_exit = True
            await asyncio.wait_for(serving, 3)

    asyncio.run(run())
