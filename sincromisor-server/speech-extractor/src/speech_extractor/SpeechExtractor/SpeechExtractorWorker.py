import logging
import time
from logging import Logger

import numpy as np
from fastapi import WebSocket
from mediapipe.tasks import python
from mediapipe.tasks.python import audio
from mediapipe.tasks.python.audio.audio_classifier import AudioClassifier
from mediapipe.tasks.python.components import containers
from sincro_models import SpeechExtractorResult


class SpeechExtractorWorker:
    classifier: AudioClassifier

    def __init__(
        self,
        session_id: str,
        voice_channels: int = 1,
        voice_sampling_rate: int = 16000,
    ):
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.session_id: str = session_id
        self.voice_channels: int = voice_channels
        self.voice_sampling_rate: int = voice_sampling_rate
        self.voice_dtype: type = np.int16
        self.voice_sample_bytes: int = np.dtype(self.voice_dtype).itemsize
        self.logger.info("SpeechExtractorWorker is initialized.")

    @classmethod
    def setup_model(cls):
        base_options = python.BaseOptions(
            model_asset_path="assets/3rd_party/yamnet.tflite",
        )
        options = audio.AudioClassifierOptions(base_options=base_options, max_results=1)
        # これが実行された瞬間VSZが32TBになる。
        SpeechExtractorWorker.classifier: AudioClassifier = (
            audio.AudioClassifier.create_from_options(options)
        )

    # てきとうな長さで音声を得る。
    # 一度に得られるフレーム数はRTC側の実装依存のため、ここでバッファリングを行う。
    # 短すぎると音声検知や認識の負荷が高くなる上音声認識がエラーとなる場合もあるため、
    # ある程度(200ms、3200フレーム程度)は確保しておく。
    async def __get_audio_buffer(self, ws: WebSocket, min_buffer_length: int = 3200):
        buffer: np.ndarray = np.zeros(0, dtype=self.voice_dtype)

        while True:
            np_frame: np.ndarray = np.frombuffer(
                await ws.receive_bytes(),
                dtype=self.voice_dtype,
            )
            buffer = np.append(buffer, np_frame)
            if buffer.size > min_buffer_length:
                # buffer = nr.reduce_noise(y=buffer, sr=self.voice_sampling_rate)
                yield buffer
                buffer = np.zeros(0, dtype=self.voice_dtype)

    # 得た音声から音声が入っていそうな部分を抽出し、WebSocket経由で送信する。
    # 音声データはある程度の長さに分割されて送信される。
    # (最大で500ms + get_audio_bufferのサイズ分)
    async def extract(
        self,
        ws: WebSocket,
        max_silence_ms: int = 600,
    ):
        self.logger.info("Start Extractor.extract.")
        in_speech: bool = False
        silence_ms: int = 0
        result = SpeechExtractorResult(
            session_id=self.session_id,
            voice=np.zeros(0, dtype=self.voice_dtype),
            voice_sampling_rate=self.voice_sampling_rate,
            voice_sample_bytes=self.voice_sample_bytes,
            voice_channels=self.voice_channels,
            start_at=-1,
        )

        async for mic_voice in self.__get_audio_buffer(ws):
            is_speech = False
            if self.__check_speech_exists(mic_voice):
                result.start_at = time.time()
                silence_ms = 0
                in_speech = True
                is_speech = True
            result.append_voice(mic_voice)
            if in_speech:
                if is_speech:
                    result.sequence_id += 1
                    await ws.send_bytes(result.to_msgpack())
                    result.clear_voice()
                elif not is_speech and len(result.voice) > 0:
                    silence_ms += (mic_voice.size / self.voice_sampling_rate) * 1000
                    if silence_ms >= max_silence_ms:
                        result.sequence_id += 1
                        result.confirmed = True
                        await ws.send_bytes(result.to_msgpack())
                        result.clear_voice()
                        result.speech_id += 1
                        result.start_at = -1
                        result.confirmed = False
                        in_speech = False
            else:
                # 実際にSpeechが始まる前のフレームを500ms分確保しておく。
                # (Speechの先頭が欠けることがよくあるため)
                result.cut_voice(-int(self.voice_sampling_rate / 2))
        self.logger.info("End Extractor.extract.")

    def __check_speech_exists(self, audio: np.ndarray) -> bool:
        audio_clip = containers.AudioData.create_from_array(
            audio.astype(float) / np.iinfo(self.voice_dtype).max,
            self.voice_sampling_rate,
        )
        try:
            classification_result_list = SpeechExtractorWorker.classifier.classify(
                audio_clip,
            )
        except Exception as e:
            self.logger.error(f"UnknownError: {repr(e)}")
            raise e
        for category in classification_result_list[0].classifications[0].categories:
            # self.logger.info(f"{self.session_id}: {category.category_name}({category.score})")
            if category.category_name == "Speech" and category.score > 0.6:
                return True
        return False
