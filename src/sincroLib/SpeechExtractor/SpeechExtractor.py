import time
import shutil
import logging
from logging import Logger
import numpy as np
from queue import Empty
from pathlib import Path
from datetime import datetime
from multiprocessing import Queue
from multiprocessing.sharedctypes import Synchronized
from mediapipe.tasks import python
from mediapipe.tasks.python.components import containers
from mediapipe.tasks.python import audio
from ..models import SpeechExtractorResult


class SpeechExtractor:
    def __init__(self, session_id: str, status_value: Synchronized):
        self.logger: Logger = logging.getLogger(__name__)
        self.session_id: str = session_id
        self.status_value: Synchronized = status_value
        self.voice_channels: int = 1
        self.voice_sampling_rate: int = 16000
        self.voice_dtype = np.int16
        self.voice_sample_bytes: int = np.dtype(self.voice_dtype).itemsize
        base_options = python.BaseOptions(
            model_asset_path="assets/3rd_party/yamnet.tflite"
        )
        options = audio.AudioClassifierOptions(base_options=base_options, max_results=1)
        # これが実行された瞬間VSZが32TBになる。
        self.classifier: audio.AudioClassifier = (
            audio.AudioClassifier.create_from_options(options)
        )

    # てきとうな長さで音声を得る。
    # 一度に得られるフレーム数はRTC側の実装依存のため、ここでバッファリングを行う。
    # 短すぎると音声検知や認識の負荷が高くなる上音声認識がエラーとなる場合もあるため、
    # ある程度(200ms、3200フレーム程度)は確保しておく。
    def getAudioBuffer(self, queue: Queue, min_buffer_length: int = 3200):
        buffer: np.ndarray = np.zeros(0, dtype=self.voice_dtype)

        while self.status_value.value >= 0:
            try:
                np_frame = queue.get(block=True, timeout=1)
            except Empty:
                continue
            except:
                return None
            buffer = np.append(buffer, np_frame)
            if buffer.size > min_buffer_length:
                # buffer = nr.reduce_noise(y=buffer, sr=self.voice_sampling_rate)
                yield buffer
                buffer = np.zeros(0, dtype=self.voice_dtype)

    def extract(
        self,
        queue: Queue,
        max_silence_ms: int = 600,
    ):
        in_speech = False
        silence_ms = 0
        result = SpeechExtractorResult(
            session_id=self.session_id,
            voice_sampling_rate=self.voice_sampling_rate,
            voice_sample_bytes=self.voice_sample_bytes,
            voice_channels=self.voice_channels,
            start_at=-1,
        )

        for mic_voice in self.getAudioBuffer(queue):
            is_speech = False
            if self.check_speech_exists(mic_voice):
                result.start_at = time.time()
                silence_ms = 0
                in_speech = True
                is_speech = True

            result.voice = np.append(result.voice, mic_voice)
            if in_speech:
                if not is_speech and len(result.voice) > 0:
                    silence_ms += (mic_voice.size / self.voice_sampling_rate) * 1000
                    if silence_ms >= max_silence_ms:
                        result.sequence_id += 1
                        result.confirmed = True
                        yield result
                        self.export_result(result)
                        result.clear_voice()
                        result.speech_id += 1
                        result.start_at = -1
                        result.confirmed = False
                        in_speech = False
                else:
                    result.sequence_id += 1
                    yield result
            else:
                # 実際にSpeechが始まる前のフレームを200ms分確保しておく。
                # (Speechの先頭が欠けることがよくあるため)
                result.voice = result.voice[-int(self.voice_sampling_rate / 5) :]

    def check_speech_exists(self, audio: np.ndarray) -> bool:
        audio_clip = containers.AudioData.create_from_array(
            audio.astype(float) / np.iinfo(self.voice_dtype).max,
            self.voice_sampling_rate,
        )
        classification_result_list = self.classifier.classify(audio_clip)
        for category in classification_result_list[0].classifications[0].categories:
            # self.logger.info(f"{self.session_id}: {category.category_name}({category.score})")
            if category.category_name == "Speech" and category.score > 0.6:
                return True
        return False

    def export_result(self, result: SpeechExtractorResult) -> str:
        time_text = datetime.fromtimestamp(result.start_at).strftime("%Y%m%d_%H%M%S.%f")
        write_dir = f"log/voice/{self.session_id}"
        Path(write_dir).mkdir(parents=True, exist_ok=True)
        if shutil.which("opusenc"):
            write_path = f"{write_dir}/{result.speech_id:06d}_{time_text}.opus"
            result.to_opusfile(path=write_path)
        else:
            write_path = f"{write_dir}/{result.speech_id:06d}_{time_text}.wav"
            result.to_wavfile(path=write_path)
        return write_path


"""
# import noisereduce as nr
# from pydub import AudioSegment, silence

class SpeechExtraction:
    def __init__(self):
        self.voice_sampling_rate = 16000
        self.voice_dtype = np.int16
        self.voice_sample_bytes = np.dtype(self.voice_dtype).itemsize

    def getAudioSegment(self, queue: Queue):
        while True:
            np_frame = queue.get()
            if np_frame is None:
                break
            np_frame = nr.reduce_noise(y=np_frame, sr=self.voice_sampling_rate)
            yield self.numPyToAudioSegment(np_frame)

    def speechExtractor(
        self,
        queue: Queue,
        silence_thresh_db: int = -40,
        min_silence_len: int = 1000,
        keep_silence: int = 800,
    ):
        voice = self.numPyToAudioSegment(np.zeros(0, dtype=self.voice_dtype))
        for mic_voice in self.getAudioSegment(queue):
            voice += mic_voice
            # 短すぎると認識できない(エラーとなる)ため
            if voice.duration_seconds < 0.2:
                continue
            silence_ranges = silence.detect_silence(
                voice,
                silence_thresh=silence_thresh_db,
                min_silence_len=min_silence_len,
                seek_step=10,
            )
            if silence_ranges:
                assert len(silence_ranges) == 1, "Silence detection logic error."
                s_start, s_end = silence_ranges[0][0], silence_ranges[0][1]
                # 先頭から検出された無音部分開始時点までの間に音声がある場合、
                # その音声を切り出して音声認識AIに渡す。
                if s_start != 0:
                    confirmed_voice = voice[0 : s_start + keep_silence]
                    yield (
                        "confirmed_voice",
                        confirmed_voice.duration_seconds,
                        self.AudioSegmentToNumPy(confirmed_voice),
                    )
                # 残りの部分はそのまま保持する
                voice = voice[s_end - keep_silence :]
            else:
                # 短すぎると音声認識でエラーになる?
                # RuntimeError: Calculated padded input size per channel: (1). Kernel size: (4). Kernel size can't be greater than actual input size
                if voice.duration_seconds >= 0.5 and self.checkThresh(
                    voice, silence_thresh_db
                ):
                    yield (
                        "pertcial_voice",
                        voice.duration_seconds,
                        self.AudioSegmentToNumPy(voice),
                    )

    def numPyToAudioSegment(self, audio: np.ndarray) -> AudioSegment:
        return AudioSegment(
            data=audio.tobytes(),
            sample_width=self.voice_sample_bytes,
            frame_rate=self.voice_sampling_rate,
            channels=1,
        )

    def AudioSegmentToNumPy(self, audio: AudioSegment) -> np.ndarray:
        return np.array(
            audio.get_array_of_samples(),
            dtype=self.voice_dtype,
        )

    def checkThresh(self, audio: AudioSegment, thresh_db: int):
        # 音声データが0.1s(100ms)に満たない場合は問答無用でFalse
        if audio.duration_seconds < 0.1:
            return False
        nonsilent_ranges = silence.detect_nonsilent(
            audio,
            silence_thresh=thresh_db,
            min_silence_len=100,
            seek_step=10,
        )
        if nonsilent_ranges:
            return True
        return False
"""
