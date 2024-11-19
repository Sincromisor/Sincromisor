import logging
import traceback
from collections import deque
from logging import Logger
from threading import Event, Thread

from sincro_config import (
    WorkerStatus,
    WorkerStatusManager,
)
from websockets.sync.client import ClientConnection, connect

from .Exceptions import AudioBrokerError
from .ExtractorReceiverThread import ExtractorReceiverThread
from .ExtractorSenderThread import ExtractorSenderThread
from .RecognizerReceiverThread import RecognizerReceiverThread
from .RecognizerSenderThread import RecognizerSenderThread
from .SynthesizerReceiverThread import SynthesizerReceiverThread
from .SynthesizerSenderThread import SynthesizerSenderThread
from .TextProcessorReceiverThread import TextProcessorReceiverThread
from .TextProcessorSenderThread import TextProcessorSenderThread


class AudioBrokerCommunicator:
    def __init__(
        self,
        comm_type: str,
        session_id: str,
        ws_url: str,
        ws: ClientConnection,
        sender_thread: Thread,
        receiver_thread: Thread,
    ):
        self.comm_type: str = comm_type
        self.session_id: str = session_id
        self.ws_url: str = ws_url
        self.ws: ClientConnection = ws
        self.sender_thread: Thread = sender_thread
        self.receiver_thread: Thread = receiver_thread

    def close(self) -> None:
        logger: Logger = logging.getLogger(
            f"{__name__}::{self.comm_type}[{self.session_id[21:26]}]",
        )

        logger.info("join sender_thread")
        try:
            self.sender_thread.join()
        except Exception as e:
            logger.error(f"Unknown Error: {repr(e)}")

        logger.info("join receiver_thread")
        try:
            self.receiver_thread.join()
        except Exception as e:
            logger.error(f"Unknown Error: {repr(e)}")

        logger.info("closing WebSocket")
        self.ws.close()
        logger.info("done.")


class AudioBrokerCommunicators:
    extractor: AudioBrokerCommunicator
    recognizer: AudioBrokerCommunicator
    synthesizer: AudioBrokerCommunicator
    text_processor: AudioBrokerCommunicator

    def __init__(
        self,
        extractor: AudioBrokerCommunicator,
        recognizer: AudioBrokerCommunicator,
        text_processor: AudioBrokerCommunicator,
        synthesizer: AudioBrokerCommunicator,
    ):
        self.extractor = extractor
        self.recognizer = recognizer
        self.text_processor = text_processor
        self.synthesizer = synthesizer

    def close(self) -> None:
        self.extractor.close()
        self.recognizer.close()
        self.text_processor.close()
        self.synthesizer.close()


class AudioBrokerEvent(Event):
    def __init__(self):
        self.__logger: Logger = logging.getLogger(__name__)
        super().__init__()

    # どこできっかけでコケたのかが分かるよう、
    # 最初にclear()が実行された時にスタックトレースをログに書き出すようにする。
    def clear(self) -> None:
        if super().is_set():
            tb_str: str = "".join(traceback.format_stack())
            self.__logger.info(f"AudioBrokerEventClear: {tb_str}")
        super().clear()


class AudioBroker:
    def __init__(
        self,
        session_id: str,
        talk_mode: str,
        redis_host: str,
        redis_port: int,
    ):
        self.__logger: Logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        self.__session_id: str = session_id
        self.__talk_mode: str = talk_mode
        self.__wstatuses: WorkerStatusManager = WorkerStatusManager(
            redis_host=redis_host,
            redis_port=redis_port,
        )

        # AudioBrokerもしくは子スレッドでなにかしらの問題が発生したら、
        # runningをclearして全てを停止する。
        self.__running: Event = AudioBrokerEvent()
        self.__running.set()

        # VoiceTransformTrack
        # -> ExtractorSenderThread: bytes
        self.__frame_buffer: deque = deque([], 25)
        # ExtractorReceiverThread
        # -> RecognizerSenderThread: SpeechExtractorResult
        self.__extractor_results: deque = deque([], 10)
        # RecognizerReceiverThread
        # -> TextProcessorSenderThread: SpeechRecognizerResult
        self.__recognizer_results: deque = deque([], 10)
        # TextProcessorReceiverThread
        # -> VoiceSynthesizerSenderThread: TextProcessorResult
        self.__text_processor_results: deque = deque([], 10)

        # VoiceTransformTrackから利用
        # RecognizerReceiverThread
        # -> VoiceTransformTrack: SpeechRecognizerResult
        self.text_channel_queue: deque = deque([])
        # SynthesizerReceiverThread
        # -> VoiceTransformTrack: VoiceSynthesizerResultFrame
        self.voice_frame_queue: deque = deque([])

        self.return_frame_format = {"sample_rate": 48000, "sample_size": 960}

        try:
            self.__communicators: AudioBrokerCommunicators = AudioBrokerCommunicators(
                extractor=self.__extractor(),
                recognizer=self.__recognizer(),
                text_processor=self.__text_processor(),
                synthesizer=self.__synthesizer(),
            )
        except ConnectionRefusedError:
            self.__logger.error(f"ConnectionRefusedError: {traceback.format_exc()}")
            self.close()
        except Exception as e:
            self.__logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            self.close()

    def is_running(self) -> bool:
        return self.__running.is_set()

    def close(self) -> None:
        self.__logger.info("Stopping AudioBroker...")
        if not self.__running.is_set():
            self.__logger.warning("AudioBroker is not running.")
            return
        self.__logger.info("STOP AudioBroker...")
        self.__running.clear()
        try:
            self.__communicators.close()
        except AttributeError:
            self.__logger.error("__communicators is not defined.")
        self.__logger.info("AudioBroker closed.")

    def __extractor(self) -> AudioBrokerCommunicator:
        wstat: WorkerStatus | None = self.__wstatuses.random_active_worker(
            worker_type="SpeechExtractor",
        )
        if wstat is None:
            raise AudioBrokerError("SpeechExtractor worker is not found.")
        ws_url: str = f"ws://{wstat.host}:{wstat.port}/SpeechExtractor"
        ws: ClientConnection = connect(ws_url)
        sender_t: ExtractorSenderThread = ExtractorSenderThread(
            ws=ws,
            running=self.__running,
            session_id=self.__session_id,
            frame_buffer=self.__frame_buffer,
        )
        sender_t.start()
        receiver_t: ExtractorReceiverThread = ExtractorReceiverThread(
            ws=ws,
            extractor_results=self.__extractor_results,
            running=self.__running,
            session_id=self.__session_id,
        )
        receiver_t.start()
        return AudioBrokerCommunicator(
            session_id=self.__session_id,
            comm_type="SpeechExtractor",
            ws_url=ws_url,
            ws=ws,
            sender_thread=sender_t,
            receiver_thread=receiver_t,
        )

    def __recognizer(self) -> AudioBrokerCommunicator:
        wstat: WorkerStatus | None = self.__wstatuses.random_active_worker(
            worker_type="SpeechRecognizer",
        )
        if wstat is None:
            raise AudioBrokerError("SpeechRecognizer worker is not found.")
        ws_url: str = f"ws://{wstat.host}:{wstat.port}/SpeechRecognizer"
        ws: ClientConnection = connect(ws_url)
        sender_t: RecognizerSenderThread = RecognizerSenderThread(
            ws=ws,
            extractor_results=self.__extractor_results,
            running=self.__running,
            session_id=self.__session_id,
        )
        sender_t.start()
        receiver_t: RecognizerReceiverThread = RecognizerReceiverThread(
            ws=ws,
            recognizer_results=self.__recognizer_results,
            running=self.__running,
            session_id=self.__session_id,
        )
        receiver_t.start()
        return AudioBrokerCommunicator(
            session_id=self.__session_id,
            comm_type="SpeechRecognizer",
            ws_url=ws_url,
            ws=ws,
            sender_thread=sender_t,
            receiver_thread=receiver_t,
        )

    def __text_processor(self) -> AudioBrokerCommunicator:
        wstat: WorkerStatus | None = self.__wstatuses.random_active_worker(
            worker_type="TextProcessor",
        )
        if wstat is None:
            raise AudioBrokerError("TextProcessor worker is not found.")
        ws_url: str = (
            f"ws://{wstat.host}:{wstat.port}/TextProcessor?talk_mode={self.__talk_mode}"
        )
        ws: ClientConnection = connect(ws_url)
        sender_t: TextProcessorSenderThread = TextProcessorSenderThread(
            ws=ws,
            running=self.__running,
            session_id=self.__session_id,
            recognizer_results=self.__recognizer_results,
            text_channel_queue=self.text_channel_queue,
        )
        sender_t.start()
        receiver_t: TextProcessorReceiverThread = TextProcessorReceiverThread(
            ws=ws,
            running=self.__running,
            session_id=self.__session_id,
            text_channel_queue=self.text_channel_queue,
            text_processor_results=self.__text_processor_results,
        )
        receiver_t.start()
        return AudioBrokerCommunicator(
            session_id=self.__session_id,
            comm_type="TextProcessor",
            ws_url=ws_url,
            ws=ws,
            sender_thread=sender_t,
            receiver_thread=receiver_t,
        )

    def __synthesizer(self) -> AudioBrokerCommunicator:
        wstat: WorkerStatus | None = self.__wstatuses.random_active_worker(
            worker_type="VoiceSynthesizer",
        )
        if wstat is None:
            raise AudioBrokerError("voiceSynthesizer worker is not found.")
        ws_url: str = f"ws://{wstat.host}:{wstat.port}/VoiceSynthesizer"
        ws: ClientConnection = connect(ws_url)
        sender_t: SynthesizerSenderThread = SynthesizerSenderThread(
            ws=ws,
            text_processor_results=self.__text_processor_results,
            running=self.__running,
            session_id=self.__session_id,
        )
        sender_t.start()
        receiver_t: SynthesizerReceiverThread = SynthesizerReceiverThread(
            ws=ws,
            voice_frame_queue=self.voice_frame_queue,
            return_frame_format=self.return_frame_format,
            running=self.__running,
            session_id=self.__session_id,
        )
        receiver_t.start()
        return AudioBrokerCommunicator(
            comm_type="VoiceSynthesizer",
            session_id=self.__session_id,
            ws_url=ws_url,
            ws=ws,
            sender_thread=sender_t,
            receiver_thread=receiver_t,
        )

    def add_frame(self, frame: bytes) -> None:
        if not self.__running.is_set():
            raise AudioBrokerError("AudioBroker is not running.")

        self.__frame_buffer.append(frame)
        if len(self.__frame_buffer) >= 25:
            self.__logger.warning("add_frame - overflow")
