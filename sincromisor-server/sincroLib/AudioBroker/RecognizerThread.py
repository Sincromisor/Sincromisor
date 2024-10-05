import time
import logging
from logging import Logger
import traceback
from collections import deque
from threading import Thread, Event
from websockets.sync.client import ClientConnection
from websockets.exceptions import ConnectionClosed
from ..models import SpeechExtractorResult, SpeechRecognizerResult


class RecognizerSenderThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        extractor_results: deque,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        self.__ws: ClientConnection = ws
        self.__extractor_results: deque = extractor_results
        self.__running: Event = running
        self.__session_id: str = session_id

    def __pop_extractor_result(self) -> bytes:
        base_e_result: SpeechExtractorResult = self.__extractor_results.popleft()

        # 音声認識に時間が掛かった場合、Extractorから複数の音声パケットが届いている
        # 場合がある。この場合は、各パケットの音声データを結合する。
        # パケットに音声の末端である(confirmed=Trueである)場合は、そこで結合を終了し返す。
        while len(self.__extractor_results) > 0:
            e_result: SpeechExtractorResult = self.__extractor_results.popleft()
            base_e_result.append_voice(e_result.voice)
            base_e_result.sequence_id = e_result.sequence_id
            if e_result.confirmed:
                return base_e_result.to_msgpack()
        return base_e_result.to_msgpack()

    def run(self):
        self.__logger.info(f"Thread start.")
        try:
            last_ping: float = time.time()
            while self.__running.is_set():
                if len(self.__extractor_results) > 0:
                    self.__ws.send(self.__pop_extractor_result())
                else:
                    if last_ping < time.time() + 10:
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


class RecognizerReceiverThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        recognizer_results: deque,
        text_channel_queue: deque,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.__logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        self.__ws: ClientConnection = ws
        self.__recognizer_results: deque = recognizer_results
        self.__text_channel_queue: deque = text_channel_queue
        self.__running: Event = running
        self.__session_id: str = session_id

    def run(self):
        self.__logger.info(f"Thread start.")
        while self.__running.is_set():
            try:
                pack: bytes = self.__ws.recv(timeout=5)
                sr_result: SpeechRecognizerResult = SpeechRecognizerResult.from_msgpack(
                    pack
                )

                # to SynthesizerThread
                self.__recognizer_results.append(sr_result)
                # to TextChannel
                self.__text_channel_queue.append(sr_result)
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
