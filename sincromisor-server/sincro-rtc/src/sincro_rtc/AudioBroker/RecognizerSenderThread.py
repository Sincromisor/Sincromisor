import logging
import time
import traceback
from collections import deque
from logging import Logger
from threading import Event, Thread

from sincro_models import SpeechExtractorResult
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import ClientConnection


class RecognizerSenderThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        extractor_results: deque,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.__session_id: str = session_id
        self.__logger: Logger = logging.getLogger(
            __name__ + f"[{self.__session_id[21:26]}]"
        )
        self.__ws: ClientConnection = ws
        self.__extractor_results: deque = extractor_results
        self.__running: Event = running

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

    def run(self) -> None:
        self.__logger.info("Thread start.")
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
