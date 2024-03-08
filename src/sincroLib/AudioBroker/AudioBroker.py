import logging
from logging import Logger
import traceback
from collections import deque
from threading import Event
from urllib.parse import urljoin
from websockets.sync.client import connect, ClientConnection
from websockets.exceptions import ConnectionClosed
from .ExtractorThread import ExtractorSenderThread, ExtractorReceiverThread
from .RecognizerThread import RecognizerSenderThread, RecognizerReceiverThread
from .SynthesizerThread import SynthesizerSenderThread, SynthesizerReceiverThread
from ..utils import ConfigManager


class AudioBroker:
    def __init__(
        self,
        session_id: str,
    ):
        self.logger: Logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")

        self.session_id: str = session_id
        self.config = ConfigManager()
        self.extractor_url: str = urljoin(
            self.config.get_random_worker_conf(type="SpeechExtractor")["url"],
            "SpeechExtractor",
        )
        self.recognizer_url: str = urljoin(
            self.config.get_random_worker_conf(type="SpeechRecognizer")["url"],
            "SpeechRecognizer",
        )
        self.synthesizer_url: str = urljoin(
            self.config.get_random_worker_conf(type="VoiceSynthesizer")["url"],
            "VoiceSynthesizer",
        )
        # 内部で利用
        self.frame_buffer: deque = deque([], 25)
        self.extractor_results: deque = deque([], 3)
        self.recognizer_results: deque = deque([], 3)

        # VoiceTransformTrackから利用
        # SpeechExtractorResultのdeque
        self.text_channel_queue: deque = deque([])
        # SpeechRecognizerResultのdeque
        self.voice_frame_queue: deque = deque([])

        self.return_frame_format = {"sample_rate": 48000, "sample_size": 960}

        self.running: Event = Event()
        self.running.clear()
        self.threads: dict = {}
        self.startable: bool = True

    def start(self) -> None:
        if not self.startable:
            self.logger.warn("AudioBroker is already running.")
            return
        self.startable = False
        self.running.set()
        try:
            self.extractor()
            self.recognizer()
            self.synthesizer()
        except ConnectionRefusedError:
            self.logger.error(f"ConnectionRefusedError: {traceback.format_exc()}")
            self.close()
        except Exception as e:
            self.logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            self.close()

    def stop(self) -> None:
        if not self.running.is_set():
            self.logger.warn("AudioBroker is not running.")
            return
        self.logger.info("STOP AudioBroker...")
        self.running.clear()

    def join(self) -> None:
        for name, thread in self.threads.items():
            thread.join()
            self.logger.info(f"Join: {name}")
        try:
            self.extractor_ws.close()
        except AttributeError:
            self.logger.error("extractor_ws is not initialized.")
        try:
            self.recognizer_ws.close()
        except AttributeError:
            self.logger.error("recognizer_ws is not initialized.")
        try:
            self.synthesizer_ws.close()
        except AttributeError:
            self.logger.error("synthesizer_ws is not initialized.")
        self.startable = True

    def close(self) -> None:
        self.stop()
        self.join()

    def extractor(self) -> None:
        self.extractor_ws: ClientConnection = connect(self.extractor_url)
        self.threads["extractor_sender"] = ExtractorSenderThread(
            ws=self.extractor_ws,
            running=self.running,
            session_id=self.session_id,
            frame_buffer=self.frame_buffer,
        )
        self.threads["extractor_sender"].start()
        self.threads["extractor_receiver"] = ExtractorReceiverThread(
            ws=self.extractor_ws,
            extractor_results=self.extractor_results,
            running=self.running,
            session_id=self.session_id,
        )
        self.threads["extractor_receiver"].start()

    def recognizer(self) -> None:
        self.recognizer_ws: ClientConnection = connect(self.recognizer_url)
        self.threads["recognizer_sender"] = RecognizerSenderThread(
            ws=self.recognizer_ws,
            extractor_results=self.extractor_results,
            running=self.running,
            session_id=self.session_id,
        )
        self.threads["recognizer_sender"].start()
        self.threads["recognizer_receiver"] = RecognizerReceiverThread(
            ws=self.recognizer_ws,
            recognizer_results=self.recognizer_results,
            text_channel_queue=self.text_channel_queue,
            running=self.running,
            session_id=self.session_id,
        )
        self.threads["recognizer_receiver"].start()

    def synthesizer(self) -> None:
        self.synthesizer_ws: ClientConnection = connect(self.synthesizer_url)
        self.threads["synthesizer_sender"] = SynthesizerSenderThread(
            ws=self.synthesizer_ws,
            recognizer_results=self.recognizer_results,
            running=self.running,
            session_id=self.session_id,
        )
        self.threads["synthesizer_sender"].start()
        self.threads["synthesizer_receiver"] = SynthesizerReceiverThread(
            ws=self.synthesizer_ws,
            voice_frame_queue=self.voice_frame_queue,
            return_frame_format=self.return_frame_format,
            running=self.running,
            session_id=self.session_id,
        )
        self.threads["synthesizer_receiver"].start()

    def add_frame(self, frame: bytes) -> None:
        self.frame_buffer.append(frame)
        if len(self.frame_buffer) >= 25:
            self.logger.warn("add_frame - overflow")
