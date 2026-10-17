"""要求を同期合成へ渡し、回収完了後にWebSocketへ返す接続単位の処理。"""

import asyncio
import logging

from fastapi import WebSocket
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from sincro_models import (
    TextProcessorResult,
    VoiceSynthesizerRequest,
)

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
                audio_format="audio/ogg;codecs=opus",
                style_id=self.__voicevox_style_id,
                pre_phoneme_length=0.1,
                post_phoneme_length=0.1,
            )
            # 一要求ずつ完了を待ち、同期I/Oと音声変換だけをスレッドへ委ねる。
            pending = asyncio.create_task(
                asyncio.to_thread(
                    self.__vvox.get_voice,
                    vs_request=request,
                    session_id=result.session_id,
                    sequence_id=result.sequence_id,
                )
            )
            try:
                with diagnostic.operation("process"):
                    voice = await asyncio.shield(pending)
            except asyncio.CancelledError:
                # スレッドは取消で止まらない。closeより先に回収し、結果は送らない。
                cleanup = asyncio.gather(pending, return_exceptions=True)
                while not cleanup.done():
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        continue
                raise
            # キャッシュの発話IDは保存時のままなので、送信する要求のIDへ戻す。
            voice.speech_id = request.speech_id
            with diagnostic.operation("send"):
                await ws.send_bytes(voice.to_msgpack())
