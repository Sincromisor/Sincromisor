"""Goから届く要求を直列処理し、結果をWebSocketへ返す。接続が受信・応答処理の生存期間を所有する。"""

import asyncio
import logging
from collections.abc import AsyncGenerator, Generator
from contextlib import aclosing
from logging import Logger
from time import perf_counter

from fastapi import WebSocket
from sincro_models import TextProcessorRequest, TextProcessorResult


class TextProcessorWorker:
    """要求ごとの応答生成とWebSocket送信を結ぶ基底処理担当。

    接続ごとに生成され、受信と直列応答を別処理で管理する。いずれかが終われば
    他方を必ず終了させるため、Difyなどの応答待ちを接続終了後に残さない。
    """

    def __init__(self) -> None:
        """接続ごとの話者情報と、処理時間の記録先を初期化する。"""
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)

        self.message_type: str = "system"
        self.speaker_id: str = "system"
        self.speaker_name: str = "Glorious AI"

    async def communicate(self, ws: WebSocket) -> None:
        """確定済み要求を直列処理し、失敗・切断・取消時に両子処理を終了待機する。

        WebSocketの受信・送信失敗と応答生成の例外はサービス入口へ伝える。
        要求の到着待ちとHTTP待機のいずれでも、親の取消で後始末まで完了する。
        """
        requests: asyncio.Queue[bytes] = asyncio.Queue()
        receive_task = asyncio.create_task(self.__receive_requests(ws, requests))
        process_task = asyncio.create_task(self.__process_requests(ws, requests))
        try:
            done, _ = await asyncio.wait(
                (receive_task, process_task),
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                task.result()
        finally:
            await self.__cancel_all(receive_task, process_task)

    async def __receive_requests(
        self,
        ws: WebSocket,
        requests: asyncio.Queue[bytes],
    ) -> None:
        """受信を継続し、切断を進行中の応答処理へ即時に知らせる。"""
        while pack := await ws.receive_bytes():
            # ponytail: 応答中の次要求も保持する単純な待ち行列。要求量の上限が必要なら接続ごとの上限制御を追加する。
            requests.put_nowait(pack)

    async def __process_requests(
        self,
        ws: WebSocket,
        requests: asyncio.Queue[bytes],
    ) -> None:
        """受信順に要求を処理し、応答中でも受信処理の切断を待たせない。"""
        while True:
            request = TextProcessorRequest.from_msgpack(pack=await requests.get())
            if request.confirmed:
                await self.__process_and_send(ws, request)

    async def __process_and_send(
        self,
        ws: WebSocket,
        request: TextProcessorRequest,
    ) -> None:
        """Dify応答の送信と終了記録を一つの取消可能な処理として所有する。"""
        start_t = perf_counter()
        response_t = -1.0
        self.logger.info(["process_request", request])
        async with aclosing(self.process_async(request=request)) as responses:
            async for response in responses:
                self.logger.info(["send_response", response])
                await ws.send_bytes(response.to_msgpack())
                if response_t < 0:
                    response_t = perf_counter()
        self.logger.info(
            {
                "session_id": request.session_id,
                "speech_id": request.request_message.speech_id,
                "response_time": response_t - start_t,
                "query_time": perf_counter() - start_t,
            }
        )

    async def __cancel_all(self, *tasks: asyncio.Task[object]) -> None:
        """全ての子処理を先に取消し、元の例外を隠さず後始末だけを完了する。"""
        for task in tasks:
            task.cancel()
        # 発端の例外はcommunicateから伝播する。失敗済みの子を再送出すると
        # 他方の回収が飛ぶため、ここでは両者の終了を必ず待つ。
        await asyncio.gather(*tasks, return_exceptions=True)

    async def process_async(
        self,
        request: TextProcessorRequest,
    ) -> AsyncGenerator[TextProcessorResult, None]:
        """同期実装を既存の処理契約のまま非同期WebSocket処理へ接続する。"""
        for response in self.process(request=request):
            yield response

    def process(
        self,
        request: TextProcessorRequest,
    ) -> Generator[TextProcessorResult, None, None]:
        """同期実装用の既定応答として、認識本文をそのまま確定する。"""
        response: TextProcessorResult = TextProcessorResult.from_request(
            message_type=self.message_type,
            speaker_id=self.speaker_id,
            speaker_name=self.speaker_name,
            request=request,
        )
        if response.append_response_message(request.request_message.message):
            yield response
        response.finalize()
        yield response
