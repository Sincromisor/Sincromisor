import logging
import time
import traceback
from collections import deque
from logging import Logger
from threading import Event, RLock, Thread

from sincro_config import (
    ServiceDescription,
    ServiceDiscoveryReferrer,
    ServiceDiscoveryReferrerError,
)
from sincro_models import ChatMessage
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
            "sincro."
            + self.__class__.__name__
            + f"::{self.comm_type}[{self.session_id[21:26]}]",
        )

        # 先にwsを閉じて recv/send のブロックを解除し、joinで待ちやすくする。
        logger.info("closing WebSocket")
        try:
            self.ws.close()
        except Exception as e:
            logger.error(f"Unknown Error: {repr(e)}")

        logger.info(f"{self.comm_type} - join sender_thread")
        try:
            self.sender_thread.join(timeout=2.0)
        except Exception as e:
            logger.error(f"Unknown Error: {repr(e)}")

        logger.info(f"{self.comm_type} join receiver_thread")
        try:
            self.receiver_thread.join(timeout=2.0)
        except Exception as e:
            logger.error(f"Unknown Error: {repr(e)}")

        if self.sender_thread.is_alive():
            logger.warning(f"{self.comm_type} sender_thread is still alive.")
        if self.receiver_thread.is_alive():
            logger.warning(f"{self.comm_type} receiver_thread is still alive.")
        logger.info("done.")

    def is_alive(self) -> bool:
        return self.sender_thread.is_alive() and self.receiver_thread.is_alive()


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

    def is_alive(self) -> bool:
        return (
            self.extractor.is_alive()
            and self.recognizer.is_alive()
            and self.text_processor.is_alive()
            and self.synthesizer.is_alive()
        )


class AudioBrokerEvent(Event):
    def __init__(self):
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        super().__init__()

    # どこできっかけでコケたのかが分かるよう、
    # 最初にclear()が実行された時にスタックトレースをログに書き出すようにする。
    def clear(self) -> None:
        if super().is_set():
            tb_str: str = "".join(traceback.format_stack())
            self.__logger.info(f"AudioBrokerEventClear: {tb_str}")
        super().clear()


class AudioBroker:
    _RECONNECT_BASE_SEC = 1.0
    _RECONNECT_MAX_SEC = 30.0

    # talk_mode: chat, sincro
    def __init__(
        self,
        session_id: str,
        talk_mode: str,
        consul_agent_host: str | None,
        consul_agent_port: int | None,
        fallback_host: str | None = None,
        fallback_port: int | None = None,
    ):
        self.__logger: Logger = logging.getLogger(
            "sincro." + self.__class__.__name__ + f"[{session_id[21:26]}]"
        )
        self.__session_id: str = session_id
        self.__talk_mode: str = talk_mode
        self.__sd_refrrer: ServiceDiscoveryReferrer | None = None
        if consul_agent_host and consul_agent_port:
            self.__sd_refrrer = ServiceDiscoveryReferrer(
                consul_agent_host=consul_agent_host, consul_agent_port=consul_agent_port
            )
        self.__fallback_host: str | None = fallback_host
        self.__fallback_port: int | None = fallback_port

        # 明示的に停止するまではrunningを維持し、
        # ワーカ通信障害はconnect()で再接続を試行する。
        self.__running: Event = AudioBrokerEvent()
        self.__running.set()
        self.__communicators: AudioBrokerCommunicators | None = None
        # connect/is_running/close が並行実行された際の二重close・二重connectを防ぐ。
        self.__state_lock: RLock = RLock()

        # VoiceTransformTrack
        # -> ExtractorSenderThread: bytes
        # 50frame(960samples * 50frame = 48000samples)
        self.__frame_buffer: deque = deque([], 50)
        # ExtractorReceiverThread
        # -> RecognizerSenderThread: SpeechExtractorResult
        self.__extractor_results: deque = deque([], 10)
        # RecognizerReceiverThread
        # -> TextProcessorSenderThread: SpeechRecognizerResult
        self.__recognizer_results: deque = deque([], 10)
        # ChatMessage
        # TextProcessorReceiverThread
        # -> VoiceSynthesizerSenderThread: TextProcessorResult
        self.__text_processor_results: deque = deque([], 10)

        # VoiceTransformTrackから利用
        # RecognizerReceiverThread
        # -> VoiceTransformTrack: SpeechRecognizerResult
        # 障害時にDataChannel送信が滞った場合でもメモリが増え続けないよう、
        # テキストキューは古い要素から自動破棄する。
        self.text_channel_queue: deque = deque([], 200)
        # SynthesizerReceiverThread
        # -> VoiceTransformTrack: VoiceSynthesizerResultFrame
        # 音声フレームも上限を設け、長時間の下流障害でのメモリ増加を抑える。
        self.voice_frame_queue: deque = deque([], 2000)

        self.return_frame_format = {"sample_rate": 48000, "sample_size": 960}
        self.__last_connect: float = 0.0
        self.__reconnect_failures: int = 0
        self.__stop_requested: bool = False

    def connect(self) -> None:
        # 接続状態と communicator 差し替えを原子的に扱う。
        with self.__state_lock:
            if self.__stop_requested:
                return

            # 失敗回数に応じた指数バックオフで再接続を試行する。
            wait_sec: float = min(
                self._RECONNECT_MAX_SEC,
                self._RECONNECT_BASE_SEC * (2**self.__reconnect_failures),
            )
            if self.__last_connect + wait_sec > time.time():
                return

            self.__last_connect = time.time()
            self.__close_communicators()
            self.__running.set()

            self.__logger.info("connecting worker...")
            try:
                extractor: AudioBrokerCommunicator = self.__extractor()
                recognizer: AudioBrokerCommunicator = self.__recognizer()
                text_processor: AudioBrokerCommunicator = self.__text_processor()
                synthesizer: AudioBrokerCommunicator = self.__synthesizer()
                self.__communicators = AudioBrokerCommunicators(
                    extractor=extractor,
                    recognizer=recognizer,
                    text_processor=text_processor,
                    synthesizer=synthesizer,
                )
                self.__reconnect_failures = 0
                self.__logger.info("AudioBroker worker connection recovered.")
            except AudioBrokerError:
                self.__logger.error(f"AudioBrokerError: {traceback.format_exc()}")
                self.__err_to_chat(
                    message=f"AudioBrokerError: {traceback.format_exc()}"
                )
                self.__mark_connect_failure()
            except ConnectionRefusedError:
                self.__logger.error(f"ConnectionRefusedError: {traceback.format_exc()}")
                self.__err_to_chat(
                    message=f"ConnectionRefusedError: {traceback.format_exc()}"
                )
                self.__mark_connect_failure()
            except TimeoutError:
                self.__logger.error(f"TimeoutError: {traceback.format_exc()}")
                self.__err_to_chat(message=f"TimeoutError: {traceback.format_exc()}")
                self.__mark_connect_failure()
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}"
                )
                self.__err_to_chat(
                    message=f"UnknownError: {repr(e)}\n{traceback.format_exc()}"
                )
                self.__mark_connect_failure()

    def is_running(self) -> bool:
        # 稼働判定と不健全時のcloseを同一ロックで行い、判定直後の競合を避ける。
        with self.__state_lock:
            if not self.__running.is_set():
                return False

            if self.__communicators is None:
                return False

            # どれか1つでもsender/receiverが終了した場合は不健全と見なし再接続対象にする。
            if not self.__communicators.is_alive():
                self.__logger.warning(
                    "Worker communication thread terminated. reconnect required."
                )
                self.__running.clear()
                self.__close_communicators()
                return False

            return self.__running.is_set()

    def close(self) -> None:
        # 明示close時は再接続試行を止めてから通信資産を解放する。
        with self.__state_lock:
            self.__logger.info("Stopping AudioBroker...")
            self.__stop_requested = True
            self.__logger.info("STOP AudioBroker...")
            self.__running.clear()
            self.__close_communicators()
            self.__logger.info("AudioBroker closed.")

    def __mark_connect_failure(self) -> None:
        # 呼び出し元で __state_lock を保持している想定。
        self.__reconnect_failures += 1
        self.__running.clear()
        self.__close_communicators()

    def __close_communicators(self) -> None:
        # 呼び出し元で __state_lock を保持している想定。
        if self.__communicators is None:
            return
        try:
            self.__communicators.close()
        except Exception as e:
            self.__logger.error(f"close_communicators - UnknownError: {repr(e)}")
        finally:
            self.__communicators = None

    def __get_worker(self, worker_type: str) -> ServiceDescription:
        worker: ServiceDescription | None
        try:
            if self.__sd_refrrer is None:
                raise ServiceDiscoveryReferrerError("Consul agent is not set.")
            worker = self.__sd_refrrer.get_random_worker(worker_type=worker_type)
        except ServiceDiscoveryReferrerError as e:
            self.__logger.error(
                f"ServiceDiscoveryReferrerError: {repr(e)}\n{traceback.format_exc()}"
            )
            if self.__fallback_host is None or self.__fallback_port is None:
                raise AudioBrokerError(f"{worker_type} fallback worker is not found.")
            worker = ServiceDescription(
                index=-1,
                service_name=worker_type,
                service_id=f"{worker_type}FallbackServer",
                service_address=self.__fallback_host,
                service_port=self.__fallback_port,
            )
            self.__logger.warning(
                f"Set fallback server :{self.__fallback_host}:{self.__fallback_port}"
            )
        if worker is None:
            raise AudioBrokerError(f"{worker_type} worker is not found.")
        return worker

    def __extractor(self) -> AudioBrokerCommunicator:
        worker: ServiceDescription = self.__get_worker(worker_type="SpeechExtractor")
        match self.__talk_mode:
            case "chat":
                max_slince_ms: int = 1000
            case "sincro":
                max_slince_ms: int = 600
            case _:
                max_slince_ms: int = 1000
        ws_url: str = f"ws://{worker.service_address}:{worker.service_port}/api/v1/SpeechExtractor/extract?max_silence_ms={max_slince_ms}"
        self.__logger.info(f"Connecting {ws_url}")
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
        worker: ServiceDescription = self.__get_worker(worker_type="SpeechRecognizer")
        ws_url: str = f"ws://{worker.service_address}:{worker.service_port}/api/v1/SpeechRecognizer/recognize"
        self.__logger.info(f"Connecting {ws_url}")
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
        worker: ServiceDescription = self.__get_worker(worker_type="TextProcessor")
        ws_url: str = f"ws://{worker.service_address}:{worker.service_port}/api/v1/TextProcessor/{self.__talk_mode}"
        self.__logger.info(f"Connecting {ws_url}")
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
        worker: ServiceDescription = self.__get_worker(worker_type="VoiceSynthesizer")
        ws_url: str = f"ws://{worker.service_address}:{worker.service_port}/api/v1/VoiceSynthesizer/synthesize"
        self.__logger.info(f"Connecting {ws_url}")
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
        if len(self.__frame_buffer) >= 50:
            self.__logger.warning(
                f"add_frame - overflow len: {len(self.__frame_buffer)}"
            )
            # 溢れたら0.5秒分(25frame)破棄する
            while len(self.__frame_buffer) >= 25:
                self.__frame_buffer.popleft()

    def __err_to_chat(self, message: str) -> None:
        self.text_channel_queue.append(
            ChatMessage(
                message_type="error",
                speaker_id="system",
                speaker_name="Sincromisor",
                speech_id=-1,
                message=message,
            )
        )
