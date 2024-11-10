import time
import logging
from logging import Logger
import traceback
from io import BytesIO
from collections import deque
from collections.abc import Generator
from threading import Thread, Event
from websockets.sync.client import ClientConnection
from websockets.exceptions import ConnectionClosed
import av
from av import AudioResampler
from av.container import InputContainer
from sincro_models import (
    TextProcessorResult,
    VoiceSynthesizerResult,
    VoiceSynthesizerResultFrame,
)


class SynthesizerSenderThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        text_processor_results: deque,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.__session_id: str = session_id
        self.__logger: Logger = logging.getLogger(
            __name__ + f"[{self.__session_id[21:26]}]"
        )
        self.__ws: ClientConnection = ws
        self.__text_processor_results: deque = text_processor_results
        self.__running: Event = running

    def run(self) -> None:
        self.__logger.info(f"Thread start.")
        try:
            last_ping: float = time.time()
            while self.__running.is_set():
                if len(self.__text_processor_results) > 0:
                    tp_result: TextProcessorResult = (
                        self.__text_processor_results.popleft()
                    )
                    self.__logger.info(f"Send: {repr(tp_result)}")
                    self.__ws.send(tp_result.to_msgpack())
                else:
                    if last_ping <= time.time() + 10:
                        self.__ws.ping()
                        last_ping = time.time()
                    time.sleep(0.2)
            self.__logger.info("Cancelled by another thread.")
        except ConnectionClosed:
            self.__logger.info("ConnectionClosed.")
        except Exception as e:
            self.__logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
        self.__logger.info("Thread terminated.")
        self.__running.clear()


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
        self.__logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        self.__ws: ClientConnection = ws
        self.__voice_frame_queue: deque = voice_frame_queue
        self.__return_frame_format: dict = return_frame_format
        self.__running: Event = running
        self.__session_id: str = session_id

    def run(self) -> None:
        self.__logger.info(f"Thread start.")
        while self.__running.is_set():
            try:
                pack: bytes = self.__ws.recv(timeout=5)
                vs_result: VoiceSynthesizerResult = VoiceSynthesizerResult.from_msgpack(
                    pack
                )
                for vs_frame in self.__voice_splitter(
                    vs_result=vs_result,
                    target_frame_rate=self.__return_frame_format["sample_rate"],
                    target_frame_size=self.__return_frame_format["sample_size"],
                ):
                    self.__voice_frame_queue.append(vs_frame)
            except TimeoutError:
                pass  # タイムアウトした時のみやり直す。
            except ConnectionClosed:
                self.__logger.info("ConnectionClosed.")
                break
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}"
                )
                traceback.print_exc()
                break
        self.__logger.info("Thread terminated.")
        self.__running.clear()

    # 音声を指定されたフレームレートとフレーム長にリサンプリングし、
    # フレームごとに音声再生・口モーション用キューに書き出す。
    def __voice_splitter(
        self,
        vs_result: VoiceSynthesizerResult,
        target_frame_rate: int,
        target_frame_size: int,
    ) -> Generator[VoiceSynthesizerResultFrame, None, None]:
        # 1ch 16000Hzの音声を2ch 48000Hzに変換し、20ms(960 / 48000)ごとに分割し直す。
        # 960はWebRTCでopus音声を得た際のデフォルトフレームサイズだが、
        # 環境によって異なる可能性があるため、将来的にはパラメーターで設定できるようにする。
        resampler = AudioResampler(
            layout=2, rate=target_frame_rate, frame_size=target_frame_size
        )
        container: InputContainer = av.open(BytesIO(vs_result.voice))
        frame_ms: float = target_frame_size / target_frame_rate
        timestamp_sec: float = 0.0
        next_time_sec: float = 0.0
        # mora = {'vowel': None, 'length': 0.0, 'text': None}
        for decoded_frames in container.decode(audio=0):
            for resampled_frame in resampler.resample(decoded_frames):
                # 1文字につき複数のフレームがあるため、
                # 初回のフレームであることが分かるフラグを用意する(口パク用)。
                new_text: bool = False
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
