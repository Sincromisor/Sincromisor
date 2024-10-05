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
from ..models import SincromisorConfig
from threading import Thread


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
            f"{__name__}::{self.comm_type}[{self.session_id[21:26]}]"
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

    def __init__(
        self,
        extractor: AudioBrokerCommunicator,
        recognizer: AudioBrokerCommunicator,
        synthesizer: AudioBrokerCommunicator,
    ):
        self.extractor = extractor
        self.recognizer = recognizer
        self.synthesizer = synthesizer

    def close(self) -> None:
        self.extractor.close()
        self.recognizer.close()
        self.synthesizer.close()


class AudioBrokerError(Exception):
    pass


class AudioBrokerEvent(Event):
    def __init__(self):
        self.__logger: Logger = logging.getLogger(__name__)
        super().__init__()

    # どこできっかけでコケたのかが分かるよう、
    # 最初にclear()が実行された時にスタックトレースをログに書き出すようにする。
    def clear(self) -> None:
        if super().is_set():
            self.__logger.info(f"AudioBrokerEventClear: {traceback.format_stack()}")
        super().clear()


class AudioBroker:
    def __init__(
        self,
        session_id: str,
    ):
        self.__logger: Logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        self.__session_id: str = session_id
        self.__config = SincromisorConfig.from_yaml()

        # AudioBrokerもしくは子スレッドでなにかしらの問題が発生したら、
        # runningをclearして全てを停止する。
        self.__running: Event = AudioBrokerEvent()
        self.__running.set()

        # VoiceTransformTrack -> ExtractorSenderThread: bytes
        self.__frame_buffer: deque = deque([], 25)
        # ExtractorReceiverThread -> RecognizerSenderThread: SpeechExtractorResult
        self.__extractor_results: deque = deque([], 3)
        # RecognizerReceiverThread -> SynthesizerSenderThread: SpeechRecognizerResult
        self.__recognizer_results: deque = deque([], 3)

        # VoiceTransformTrackから利用
        # RecognizerReceiverThread -> VoiceTransformTrack: SpeechRecognizerResult
        self.text_channel_queue: deque = deque([])
        # SynthesizerReceiverThread -> VoiceTransformTrack: VoiceSynthesizerResultFrame
        self.voice_frame_queue: deque = deque([])

        self.return_frame_format = {"sample_rate": 48000, "sample_size": 960}

        try:
            self.__communicators: AudioBrokerCommunicators = AudioBrokerCommunicators(
                extractor=self.__extractor(),
                recognizer=self.__recognizer(),
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
            self.__logger.error('__communicators is not defined.')
        self.__logger.info('AudioBroker closed.')

    def __extractor(self) -> None:
        ws_url: str = urljoin(
            self.__config.get_random_worker_conf(type="SpeechExtractor").Url,
            "SpeechExtractor",
        )
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
            comm_type="Extractor",
            ws_url=ws_url,
            ws=ws,
            sender_thread=sender_t,
            receiver_thread=receiver_t,
        )

    def __recognizer(self) -> None:
        ws_url: str = urljoin(
            self.__config.get_random_worker_conf(type="SpeechRecognizer").Url,
            "SpeechRecognizer",
        )
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
            text_channel_queue=self.text_channel_queue,
            running=self.__running,
            session_id=self.__session_id,
        )
        receiver_t.start()
        return AudioBrokerCommunicator(
            session_id=self.__session_id,
            comm_type="Recognizer",
            ws_url=ws_url,
            ws=ws,
            sender_thread=sender_t,
            receiver_thread=receiver_t,
        )

    def __synthesizer(self) -> None:
        ws_url: str = urljoin(
            self.__config.get_random_worker_conf(type="VoiceSynthesizer").Url,
            "VoiceSynthesizer",
        )
        ws: ClientConnection = connect(ws_url)
        sender_t: SynthesizerSenderThread = SynthesizerSenderThread(
            ws=ws,
            recognizer_results=self.__recognizer_results,
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
            comm_type="Synthesizer",
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
            self.__logger.warn("add_frame - overflow")
