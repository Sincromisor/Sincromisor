"""受信と認識を同じ接続に所属させ、切断で未開始推論を取り消す。"""

import asyncio

from fastapi import WebSocket
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from sincro_models import SpeechExtractorResult

from .recognition_input import RecognitionInput
from .recognizer_execution import RecognizerExecution

# Goの要求上限とExtractorの送信期限へ合わせる。超過は本文なしで接続異常を記録する。
MAX_REQUEST_BYTES = 1 << 20
SEND_TIMEOUT_SECONDS = 5


async def recognize_connection(
    ws: WebSocket,
    execution: RecognizerExecution,
    diagnostic: WebSocketDiagnostics,
) -> None:
    """受信を止めず、処理側だけが累積音声を所有する。どちらかの失敗で全タスクを回収する。"""
    # Goは未応答1件。受信は先読み1件までとし、過負荷を黙って破棄しない。
    incoming: asyncio.Queue[bytes] = asyncio.Queue(maxsize=1)
    try:
        async with asyncio.TaskGroup() as group:
            receiving = group.create_task(_receive(ws, incoming, diagnostic))
            processing = group.create_task(
                _recognize(ws, incoming, execution, diagnostic)
            )
            # 子だけのCancelledErrorも接続全体へ伝える。
            await receiving
            # 空フレームによる正常終了も未開始推論を取り消す。後始末の取消を主原因にしない。
            diagnostic.accept_failures = False
            processing.cancel()
    finally:
        diagnostic.accept_failures = True


async def _receive(
    ws: WebSocket,
    incoming: asyncio.Queue[bytes],
    diagnostic: WebSocketDiagnostics,
) -> None:
    """推論待ち中も切断を検出する。空フレームだけは既存どおり正常な受付終了とする。"""
    while True:
        with diagnostic.operation("receive"):
            pack = await ws.receive_bytes()
        with diagnostic.operation("decode"):
            if len(pack) > MAX_REQUEST_BYTES:
                raise ValueError("Recognition request exceeds 1 MiB.")
            if not pack:
                return
            incoming.put_nowait(pack)
        await asyncio.sleep(0)


async def _recognize(
    ws: WebSocket,
    incoming: asyncio.Queue[bytes],
    execution: RecognizerExecution,
    diagnostic: WebSocketDiagnostics,
) -> None:
    """一要求ずつ認識・保存受渡し・送信する。取消時も実行器の回収後に音声を解放する。"""
    audio = RecognitionInput()
    while True:
        pack = await incoming.get()
        with diagnostic.operation("decode"):
            request = SpeechExtractorResult.from_msgpack(pack)
        del pack
        diagnostic.ids = {
            "session_id": request.session_id,
            "speech_id": request.speech_id,
            "sequence_id": request.sequence_id,
        }
        try:
            with diagnostic.operation("process"):
                audio.append(request)
                result = await execution.recognize(spe_result=request)
            with diagnostic.operation("send"):
                async with asyncio.timeout(SEND_TIMEOUT_SECONDS):
                    await ws.send_bytes(result.to_msgpack())
        finally:
            audio.release_confirmed()
            del request
