import logging
from logging import Logger
from io import BytesIO
import av
from av.audio.resampler import AudioResampler
from ..models import SpeechRecognizerResult
from ..models import VoiceSynthesizerRequest
from ..models import VoiceSynthesizerResult
from ..models import VoiceSynthesizerResultFrame
from ..utils import ConfigManager
from .PokeText import PokeText
from .VoiceCacheManager import VoiceCacheManager


class VoiceSynthesizerWorker:
    def __init__(self):
        self.logger: Logger = logging.getLogger(__name__)
        self.poke_text: PokeText = PokeText()
        self.config: ConfigManager = ConfigManager()
        redis_conf: dict = self.config.get_random_redis_conf()
        vvox_conf: dict = self.config.get_random_voicevox_conf()
        self.vvox: VoiceCacheManager = VoiceCacheManager(
            vvox_host=vvox_conf["host"],
            vvox_port=vvox_conf["port"],
            redis_host=redis_conf["host"],
            redis_port=redis_conf["port"],
        )

    def __get_voice(
        self, voice_text: str, vvox: VoiceCacheManager, config: ConfigManager
    ) -> VoiceSynthesizerResult:
        vs_request = VoiceSynthesizerRequest(
            message=voice_text,
            audio_format="audio/wav",
            style_id=config["VoiceSynthesizer"]["DefaultStyleID"],
            pre_phoneme_length=config["VoiceSynthesizer"]["PrePhonemeLength"],
            post_phoneme_length=config["VoiceSynthesizer"]["PostPhonemeLength"],
        )
        vs_result: VoiceSynthesizerResult
        if config["VoiceSynthesizer"]["EnableRedis"]:
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

    def synth(self, sr_result: SpeechRecognizerResult):
        result_text: str = sr_result.voice_text()
        # vtext = " ".join(pktext.convert(result_text))
        # self.voice_synth(vvox=vvox, config=config, voice_text=vtext)
        for vtext in self.poke_text.convert(result_text):
            self.logger.info(f"VoiceSynthesizerRequest({sr_result.session_id}) {vtext}")
            vs_result = self.__get_voice(
                vvox=self.vvox, config=self.config, voice_text=vtext
            )
            self.logger.info(
                f"VoiceSynthesizerResult({sr_result.session_id}): {vs_result.to_json()}"
            )

            yield vs_result
