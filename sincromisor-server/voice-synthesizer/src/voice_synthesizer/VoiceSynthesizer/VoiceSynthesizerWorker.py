import logging
from logging import Logger
from typing import Generator
from sincro_models import (
    SpeechRecognizerResult,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
)
from .PokeText import PokeText
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
        self.logger: Logger = logging.getLogger(__name__)
        self.poke_text: PokeText = PokeText()
        self.vvox: VoiceCacheManager = VoiceCacheManager(
            voicevox_host=voicevox_host,
            voicevox_port=voicevox_port,
            redis_host=redis_host,
            redis_port=redis_port,
        )
        self.voicevox_style_id: int = voicevox_style_id

    def __get_voice(
        self, voice_text: str, vvox: VoiceCacheManager
    ) -> VoiceSynthesizerResult:
        vs_request: VoiceSynthesizerRequest = VoiceSynthesizerRequest(
            message=voice_text,
            audio_format="audio/wav",
            style_id=self.voicevox_style_id,
            pre_phoneme_length=0.1,
            post_phoneme_length=0.0,
        )
        vs_result: VoiceSynthesizerResult = vvox.get_voice(vs_request=vs_request)

        return vs_result

    def synth(
        self, sr_result: SpeechRecognizerResult
    ) -> Generator[VoiceSynthesizerResult, None, None]:
        result_text: str = sr_result.voice_text()
        # vtext = " ".join(pktext.convert(result_text))
        # self.voice_synth(vvox=vvox, config=config, voice_text=vtext)
        for vtext in self.poke_text.convert(result_text):
            self.logger.info(f"VoiceSynthesizerRequest({sr_result.session_id}) {vtext}")
            vs_result: VoiceSynthesizerResult = self.__get_voice(
                vvox=self.vvox, voice_text=vtext
            )
            self.logger.info(
                f"VoiceSynthesizerResult({sr_result.session_id}): {vs_result.to_json()}"
            )

            yield vs_result
