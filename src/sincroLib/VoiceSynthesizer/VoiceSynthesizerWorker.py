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
        self.vvox: VoiceCacheManager = VoiceCacheManager(
            vvox_host=self.config["VoiceSynthesizer"]["VoiceVoxHost"],
            vvox_port=self.config["VoiceSynthesizer"]["VoiceVoxPort"],
            redis_host=self.config["VoiceSynthesizer"]["RedisHost"],
            redis_port=self.config["VoiceSynthesizer"]["RedisPort"],
        )

    # 音声を指定されたフレームレートとフレーム長にリサンプリングし、
    # フレームごとに音声再生・口モーション用キューに書き出す。
    def voice_processor(
        self,
        vs_result: VoiceSynthesizerResult,
        target_frame_rate: int,
        target_frame_size: int,
    ):
        # 1ch 16000Hzの音声を2ch 48000Hzに変換し、20ms(960 / 48000)ごとに分割し直す。
        # 960はWebRTCでopus音声を得た際のデフォルトフレームサイズだが、
        # 環境によって異なる可能性があるため、将来的にはパラメーターで設定できるようにする。
        resampler: AudioResampler = AudioResampler(
            layout=2, rate=target_frame_rate, frame_size=target_frame_size
        )
        container = av.open(BytesIO(vs_result.voice))
        frame_ms: float = target_frame_size / target_frame_rate
        timestamp_sec: float = 0.0
        next_time_sec: float = 0.0
        # mora = {'vowel': None, 'length': 0.0, 'text': None}
        for decoded_frames in container.decode(audio=0):
            for resampled_frame in resampler.resample(decoded_frames):
                # 1文字につき複数のフレームがあるため、
                # 初回のフレームであることが分かるフラグを用意する(口パク用)。
                new_text = False
                if vs_result.mora_queue and timestamp_sec >= next_time_sec:
                    mora = vs_result.mora_queue.pop(0)
                    next_time_sec += mora["length"]
                    new_text = True
                yield VoiceSynthesizerResultFrame(
                    timestamp=timestamp_sec,
                    message=vs_result.message,
                    vowel=mora["vowel"],
                    length=mora["length"],
                    text=mora["text"],
                    new_text=new_text,
                    vframe=resampled_frame.to_ndarray(),
                )
                timestamp_sec += frame_ms

    def get_voice(
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
            vs_result = self.get_voice(
                vvox=self.vvox, config=self.config, voice_text=vtext
            )
            self.logger.info(
                f"VoiceSynthesizerResult({sr_result.session_id}): {vs_result.to_json()}"
            )

            yield vs_result
