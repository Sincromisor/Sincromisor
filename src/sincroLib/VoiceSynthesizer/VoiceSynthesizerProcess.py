import logging
from logging import Logger
import traceback
import time
from multiprocessing import Process, Queue
from multiprocessing.sharedctypes import Synchronized
from multiprocessing.managers import DictProxy
from io import BytesIO
import av
from av.audio.resampler import AudioResampler
from setproctitle import setproctitle
from ..models import SpeechRecognizerResult
from ..models import VoiceSynthesizerRequest
from ..models import VoiceSynthesizerResult
from ..models import VoiceSynthesizerResultFrame
from ..utils import ConfigManager
from .PokeText import PokeText
from .VoiceCacheManager import VoiceCacheManager


class VoiceSynthesizerProcess(Process):
    def __init__(
        self,
        voice_recognition_results: DictProxy,
        voice_sequence_id: DictProxy,
        write_queue: Queue,
        status_value: Synchronized,
        target_sample_rate: Synchronized,
        target_sample_size: Synchronized,
        session_id: str,
    ):
        Process.__init__(self)
        self.logger: Logger = logging.getLogger(__name__)

        self.voice_recognition_results: DictProxy = voice_recognition_results
        self.voice_sequence_id: DictProxy = voice_sequence_id
        self.write_queue: Queue = write_queue
        self.session_id: str = session_id
        self.status_value: Synchronized = status_value
        self.target_sample_rate: Synchronized = target_sample_rate
        self.target_sample_size: Synchronized = target_sample_size
        self.sequence_id: int = -1

    def get_voice_recognition_result(self) -> SpeechRecognizerResult | None:
        try:
            result: SpeechRecognizerResult
            for result in self.voice_recognition_results[self.session_id]:
                if result.sequence_id > self.sequence_id:
                    self.sequence_id = result.sequence_id
                    self.voice_sequence_id[self.session_id] = self.sequence_id
                    return result
        except KeyError:
            pass
        except ConnectionResetError:
            self.logger.error("Received ConnectionResetError.")
            self.status_value.value = -2
        except BrokenPipeError:
            self.logger.error("Received BrokenPipeError.")
            self.status_value.value = -2
        except:
            self.logger.error(f"Received UnknownError - {traceback.format_exc()}")
            traceback.print_exc()
            self.status_value.value = -2
        time.sleep(0.05)
        return None

    # 音声を指定されたフレームレートとフレーム長にリサンプリングし、
    # フレームごとに音声再生・口モーション用キューに書き出す。
    def voice_writer(
        self,
        vs_result: VoiceSynthesizerResult,
        target_frame_rate: int,
        target_frame_size: int,
    ) -> None:
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
                self.write_queue.put(
                    VoiceSynthesizerResultFrame(
                        timestamp=timestamp_sec,
                        message=vs_result.message,
                        vowel=mora["vowel"],
                        length=mora["length"],
                        text=mora["text"],
                        new_text=new_text,
                        vframe=resampled_frame.to_ndarray(),
                    )
                )
                timestamp_sec += frame_ms

    def voice_synth(
        self, voice_text: str, vvox: VoiceCacheManager, config: ConfigManager
    ) -> None:
        self.logger.info(f"VoiceSynthesizerRequest({self.session_id}) {voice_text}")
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
        self.logger.info(
            f"VoiceSynthesizerResult({self.session_id}): {vs_result.to_json()}"
        )
        self.voice_writer(
            vs_result=vs_result,
            target_frame_rate=self.target_sample_rate.value,
            target_frame_size=self.target_sample_size.value,
        )

    def run(self) -> None:
        try:
            setproctitle(f"VSynth[{self.session_id[0:5]}]")
            config: ConfigManager = ConfigManager()
            vvox: VoiceCacheManager = VoiceCacheManager(
                vvox_host=config["VoiceSynthesizer"]["VoiceVoxHost"],
                vvox_port=config["VoiceSynthesizer"]["VoiceVoxPort"],
                redis_host=config["VoiceSynthesizer"]["RedisHost"],
                redis_port=config["VoiceSynthesizer"]["RedisPort"],
            )
            poke_text: PokeText = PokeText()
            while self.status_value.value >= 0:
                sr_result: SpeechRecognizerResult = self.get_voice_recognition_result()
                if sr_result is None:
                    continue
                result_text: str = sr_result.voice_text()
                # vtext = " ".join(pktext.convert(result_text))
                # self.voice_synth(vvox=vvox, config=config, voice_text=vtext)
                for vtext in poke_text.convert(result_text):
                    self.voice_synth(vvox=vvox, config=config, voice_text=vtext)
        except:
            traceback.print_exc()
        self.write_queue.close()
