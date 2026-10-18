"""会話増分を接続内の要求番号へ結び、完成を待たずPCM区間を返す。"""

import asyncio
import logging
from threading import Event

from fastapi import WebSocket
from sincro_config.runtime_diagnostics import failure_fields
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from sincro_models import (
    TextProcessorResult,
    VoiceSynthesizerRequest,
)
from voice_synthesizer.stream_delivery import deliver_stream
from voice_synthesizer.voice_stream import StreamContext

from .VoiceCacheManager import VoiceCacheManager


class VoiceSynthesizerWorker:
    """会話応答の増分を生成要求に変換し、接続へ音声を返す。"""

    def __init__(
        self,
        voicevox_host: str,
        voicevox_port: int,
        voicevox_style_id: int,
        redis_host: str,
        redis_port: int,
        s3_host: str,
        s3_port: int,
        s3_access_key: str,
        s3_secret_key: str,
    ) -> None:
        """接続ごとの音声キャッシュと話者スタイルを準備する。"""
        self.__vvox: VoiceCacheManager = VoiceCacheManager(
            voicevox_host=voicevox_host,
            voicevox_port=voicevox_port,
            redis_host=redis_host,
            redis_port=redis_port,
            s3_host=s3_host,
            s3_port=s3_port,
            s3_access_key=s3_access_key,
            s3_secret_key=s3_secret_key,
        )
        self.__voicevox_style_id: int = voicevox_style_id

    def close(self) -> None:
        """合成処理の終了後、接続が所有するキャッシュとHTTPプールを解放する。"""
        self.__vvox.close()

    async def communicate(
        self, ws: WebSocket, diagnostic: WebSocketDiagnostics | None = None
    ) -> None:
        """本文を含む受信全体を出力せず、生成境界へ保持中のIDだけを渡す。"""
        diagnostic = diagnostic or WebSocketDiagnostics(
            logging.getLogger("sincro.VoiceSynthesizerWorker")
        )
        request_number = 0
        while True:
            with diagnostic.operation("receive"):
                pack = await ws.receive_bytes()
            if not pack:
                break
            with diagnostic.operation("decode"):
                result = TextProcessorResult.from_msgpack(pack=pack)
            diagnostic.ids = {
                "session_id": result.session_id,
                "sequence_id": result.sequence_id,
                "speech_id": result.response_message.speech_id,
            }
            if not result.voice_text:
                continue
            request = VoiceSynthesizerRequest(
                speech_id=result.response_message.speech_id,
                message=result.voice_text,
                audio_format="audio/wav",
                style_id=self.__voicevox_style_id,
                pre_phoneme_length=0.1,
                post_phoneme_length=0.1,
            )
            # 接続内の各テキスト増分に番号を割り当て、同じ発話の別要求も区別する。
            request_number += 1
            fields = {
                "connection_id": diagnostic.connection_id,
                **diagnostic.ids,
                "request_number": request_number,
            }
            diagnostic.logger.info({"event": "synthesis_received", **fields})
            context = StreamContext(request_number, Event(), fields)
            try:
                iterator = self.__vvox.stream_voice(request, context)
                await deliver_stream(ws, iterator, context)
                diagnostic.logger.info({"event": "synthesis_generated", **fields})
            except (Exception, asyncio.CancelledError) as error:
                outcome = (
                    "cancelled"
                    if isinstance(error, asyncio.CancelledError)
                    else "failed"
                )
                diagnostic.logger.log(
                    logging.INFO if outcome == "cancelled" else logging.WARNING,
                    {
                        "event": "synthesis_delivery",
                        **fields,
                        "operation": context.operation,
                        "outcome": outcome,
                        **failure_fields(error),
                    },
                )
                # 逐次生成では読取りと送信が交互に進むため、失敗した境界を保持する。
                with diagnostic.operation(context.operation):
                    raise
            # send_bytes完了だけを表す。RTCでの受信やブラウザー再生の完了ではない。
            diagnostic.logger.info(
                {
                    "event": "synthesis_delivery",
                    **fields,
                    "operation": "send",
                    "outcome": "success",
                }
            )
