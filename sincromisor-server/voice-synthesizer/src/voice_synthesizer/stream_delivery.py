"""同期PCM iteratorを一つずつ読み、送信停止と取消で所有する読取・HTTPを回収する。"""

import asyncio
from collections.abc import Iterator
from dataclasses import dataclass

from fastapi import WebSocket
from sincro_models import VoiceSynthesizerChunk
from voice_synthesizer.voice_stream import StreamContext

# 受信側が滞留した接続を無期限に保持しない。生成先読みは一つの100ms区間に限る。
SEND_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class _ReadResult:
    """同期iteratorのEOFをFutureで扱える値へ包み、区間と区別する。"""

    chunk: VoiceSynthesizerChunk | None


def _read(iterator: Iterator[VoiceSynthesizerChunk]) -> _ReadResult:
    """StopIterationをFutureへ漏らさず、正常EOFを明示的な値へ変換する。"""
    return _ReadResult(next(iterator, None))


async def _join(pending: asyncio.Task[_ReadResult]) -> None:
    """繰り返し取消を受けても同期読取りを回収し、HTTPの同時closeを避ける。"""
    cleanup = asyncio.gather(pending, return_exceptions=True)
    while not cleanup.done():
        try:
            await asyncio.shield(cleanup)
        except asyncio.CancelledError:
            continue


async def deliver_stream(
    ws: WebSocket, iterator: Iterator[VoiceSynthesizerChunk], context: StreamContext
) -> None:
    """区間を送ってから次を読む。例外・取消・送信時間切れではfinalを捏造しない。"""
    pending: asyncio.Task[_ReadResult] | None = None
    try:
        while True:
            context.operation = "process"
            pending = asyncio.create_task(asyncio.to_thread(_read, iterator))
            result = await asyncio.shield(pending)
            if result.chunk is None:
                return
            context.operation = "send"
            async with asyncio.timeout(SEND_TIMEOUT_SECONDS):
                await ws.send_bytes(result.chunk.to_msgpack())
    finally:
        context.cancelled.set()
        if pending is not None:
            await _join(pending)
        # generatorは読取りスレッドの終了後に閉じる。withがHTTP応答を必ず解放する。
        close = getattr(iterator, "close", None)
        if close is not None:
            close()
