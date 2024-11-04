import logging
from logging import Logger
from io import BytesIO
from typing import Generator
from sincro_config import SincromisorConfig, WorkerConfig
from sincro_models import (
    SpeechRecognizerResult,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
)
from .PokeText import PokeText
from .VoiceCacheManager import VoiceCacheManager


class VoiceSynthesizerWorker:
    def __init__(self):
        self.logger: Logger = logging.getLogger(__name__)
        self.poke_text: PokeText = PokeText()
        self.config: SincromisorConfig = SincromisorConfig.from_yaml()
        redis_conf: WorkerConfig = self.config.get_random_worker_conf(type="Redis")
        vvox_conf: WorkerConfig = self.config.get_random_worker_conf(type="VoiceVox")
        self.vvox: VoiceCacheManager = VoiceCacheManager(
            vvox_host=vvox_conf.Host,
            vvox_port=vvox_conf.Port,
            redis_host=redis_conf.Host,
            redis_port=redis_conf.Port,
        )

    def __get_voice(
        self, voice_text: str, vvox: VoiceCacheManager
    ) -> VoiceSynthesizerResult:
        vs_request = VoiceSynthesizerRequest(
            message=voice_text,
            audio_format="audio/wav",
            style_id=self.config.VoiceSynthesizer.DefaultStyleID,
            pre_phoneme_length=self.config.VoiceSynthesizer.PrePhonemeLength,
            post_phoneme_length=self.config.VoiceSynthesizer.PostPhonemeLength,
        )
        vs_result: VoiceSynthesizerResult
        if self.config.VoiceSynthesizer.EnableRedis:
            vs_result = vvox.get_voice(vs_request=vs_request)
        else:
            vs_result = vvox.get_voice_nocache(vs_request=vs_request)

        return vs_result
        """
        self.voice_writer(
            vs_result=vs_result,
            target_frame_rate=self.target_sample_rate.value,
            target_frame_size=self.target_sample_size.value,
        )
        """

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
