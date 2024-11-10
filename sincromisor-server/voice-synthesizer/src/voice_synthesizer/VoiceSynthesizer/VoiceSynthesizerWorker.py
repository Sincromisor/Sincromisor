import logging
from logging import Logger
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
    ):
        self.__logger: Logger = logging.getLogger(__name__)
        self.__vvox: VoiceCacheManager = VoiceCacheManager(
            voicevox_host=voicevox_host,
            voicevox_port=voicevox_port,
            redis_host=redis_host,
            redis_port=redis_port,
        )
        self.__voicevox_style_id: int = voicevox_style_id

    async def communicate(self, ws: WebSocket) -> None:
        pack: bytes
        while pack := await ws.receive_bytes():
            text_processor_result: TextProcessorResult = (
                TextProcessorResult.from_msgpack(pack=pack)
            )
            self.__logger.info(f"Receive {repr(text_processor_result)}")
            if text_processor_result.voice_text:
                await ws.send_bytes(
                    self.__synth(tp_result=text_processor_result).to_msgpack()
                )

    def __get_voice(
        self, voice_text: str, vvox: VoiceCacheManager
    ) -> VoiceSynthesizerResult:
        vs_request: VoiceSynthesizerRequest = VoiceSynthesizerRequest(
            message=voice_text,
            audio_format="audio/wav",
            style_id=self.__voicevox_style_id,
            pre_phoneme_length=0.1,
            post_phoneme_length=0.0,
        )
        vs_result: VoiceSynthesizerResult = vvox.get_voice(vs_request=vs_request)

        return vs_result

    def __synth(self, tp_result: TextProcessorResult) -> VoiceSynthesizerResult:
        vtext: str = tp_result.voice_text
        self.__logger.info(f"VoiceSynthesizerRequest({tp_result.session_id}) {vtext}")
        vs_result: VoiceSynthesizerResult = self.__get_voice(
            vvox=self.__vvox, voice_text=vtext
        )
        self.__logger.info(
            f"VoiceSynthesizerResult({tp_result.session_id}): {vs_result.to_json()}"
        )
        return vs_result
