from fastapi import WebSocket
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

    async def communicate(self, ws: WebSocket) -> None:
        """本文を含む受信全体を出力せず、生成境界へ保持中のIDだけを渡す。"""
        while pack := await ws.receive_bytes():
            result = TextProcessorResult.from_msgpack(pack=pack)
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
            voice = self.__vvox.get_voice(
                vs_request=request,
                session_id=result.session_id,
                sequence_id=result.sequence_id,
            )
            # キャッシュの発話IDは保存時のままなので、送信する要求のIDへ戻す。
            voice.speech_id = request.speech_id
            await ws.send_bytes(voice.to_msgpack())
