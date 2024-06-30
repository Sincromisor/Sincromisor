import time
import logging
from logging import Logger
import traceback
from io import BytesIO
from collections import deque
from threading import Thread, Event
from websockets.sync.client import ClientConnection
from websockets.exceptions import ConnectionClosed
import av
from av import AudioResampler
from ..models import (
    SpeechRecognizerResult,
    VoiceSynthesizerResult,
    VoiceSynthesizerResultFrame,
)


class SynthesizerSenderThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        recognizer_results: deque,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.logger: Logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")
        self.ws = ws
        self.recognizer_results = recognizer_results
        self.running = running
        self.session_id = session_id

    def run(self):
        self.logger.info(f"Thread start.")
        try:
            last_ping = time.time()
            while self.running.is_set():
                if len(self.recognizer_results) > 0:
                    sr_result: SpeechRecognizerResult = (
                        self.recognizer_results.popleft()
                    )
                    if sr_result.confirmed:
                        self.ws.send(sr_result.to_msgpack())
                else:
                    if last_ping <= time.time() + 10:
                        self.ws.ping()
                        last_ping = time.time()
                    time.sleep(0.2)
            self.logger.info("Cancelled by another thread.")
        except ConnectionClosed:
            self.logger.info("ConnectionClosed.")
        except Exception as e:
            self.logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
        self.logger.info("Thread terminated.")
        self.running.clear()


class SynthesizerReceiverThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        voice_frame_queue: deque,
        return_frame_format: dict,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")
        self.ws = ws
        self.voice_frame_queue = voice_frame_queue
        self.return_frame_format = return_frame_format
        self.running = running
        self.session_id = session_id

    def run(self):
        self.logger.info(f"Thread start.")
        while self.running.is_set():
            try:
                pack = self.ws.recv(timeout=5)
                vs_result = VoiceSynthesizerResult.from_msgpack(pack)
                for vs_frame in self.voice_splitter(
                    vs_result=vs_result,
                    target_frame_rate=self.return_frame_format["sample_rate"],
                    target_frame_size=self.return_frame_format["sample_size"],
                ):
                    self.voice_frame_queue.append(vs_frame)
            except TimeoutError:
                pass  # タイムアウトした時のみやり直す。
            except ConnectionClosed:
                self.logger.info("ConnectionClosed.")
                break
            except Exception as e:
                self.logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
                traceback.print_exc()
                break
        self.logger.info("Thread terminated.")
        self.running.clear()

    # 音声を指定されたフレームレートとフレーム長にリサンプリングし、
    # フレームごとに音声再生・口モーション用キューに書き出す。
    def voice_splitter(
        self,
        vs_result: VoiceSynthesizerResult,
        target_frame_rate: int,
        target_frame_size: int,
    ):
        # 1ch 16000Hzの音声を2ch 48000Hzに変換し、20ms(960 / 48000)ごとに分割し直す。
        # 960はWebRTCでopus音声を得た際のデフォルトフレームサイズだが、
        # 環境によって異なる可能性があるため、将来的にはパラメーターで設定できるようにする。
        resampler = AudioResampler(
            layout=2, rate=target_frame_rate, frame_size=target_frame_size
        )
        container = av.open(BytesIO(vs_result.voice))
        frame_ms = target_frame_size / target_frame_rate
        timestamp_sec = 0.0
        next_time_sec = 0.0
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
