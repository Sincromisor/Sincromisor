import logging
from logging import Logger
from time import perf_counter

from fastapi import WebSocket
from sincro_models import (
    TextProcessorResult,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
)

from .VoiceCacheManager import VoiceCacheManager


class VoiceSynthesizerWorker:
    def __init__(
        self,
        voicevox_host: str,
        voicevox_port: int,
        voicevox_style_id: int,
        redis_host: str,
        redis_port: int,
        minio_host: str,
        minio_port: int,
        minio_access_key: str,
        minio_secret_key: str,
    ):
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__vvox: VoiceCacheManager = VoiceCacheManager(
            voicevox_host=voicevox_host,
            voicevox_port=voicevox_port,
            redis_host=redis_host,
            redis_port=redis_port,
            minio_host=minio_host,
            minio_port=minio_port,
            minio_access_key=minio_access_key,
            minio_secret_key=minio_secret_key,
        )
        self.__voicevox_style_id: int = voicevox_style_id

    async def communicate(self, ws: WebSocket) -> None:
        pack: bytes
        while pack := await ws.receive_bytes():
            tp_result: TextProcessorResult = TextProcessorResult.from_msgpack(pack=pack)
            self.__logger.info(f"Receive {repr(tp_result)}")
            if tp_result.voice_text:
                self.__logger.info(
                    {
                        "type": "VoiceSynthesizerRequest",
                        "session_id": tp_result.session_id,
                        "speech_id": tp_result.speech_id,
                        "voice_text": tp_result.voice_text,
                    },
                )
                start_t = perf_counter()
                vs_result: VoiceSynthesizerResult = self.__get_voice(
                    vvox_cm=self.__vvox,
                    voice_text=tp_result.voice_text,
                )
                self.__logger.info(
                    {
                        "type": "VoiceSynthesizerResult",
                        "session_id": tp_result.session_id,
                        "speech_id": tp_result.speech_id,
                        "query_time": perf_counter() - start_t,
                        "message": vs_result.message,
                        "speeking_time": vs_result.speaking_time,
                    },
                )
                await ws.send_bytes(vs_result.to_msgpack())

    def __get_voice(
        self,
        voice_text: str,
        vvox_cm: VoiceCacheManager,
    ) -> VoiceSynthesizerResult:
        vs_request: VoiceSynthesizerRequest = VoiceSynthesizerRequest(
            message=voice_text,
            # "audio/ogg;codecs=opus"にしたい
            audio_format="audio/ogg;codecs=opus",
            style_id=self.__voicevox_style_id,
            pre_phoneme_length=0.1,
            post_phoneme_length=0.1,
        )
        vs_result: VoiceSynthesizerResult = vvox_cm.get_voice(vs_request=vs_request)

        return vs_result
