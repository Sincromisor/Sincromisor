import logging
import traceback
from collections import deque
from logging import Logger
from threading import Event, Thread

from sincro_models import SpeechExtractorResult
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import ClientConnection


class ExtractorReceiverThread(Thread):
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
            "sincro." + self.__class__.__name__ + f"[{self.__session_id[21:26]}]",
        )
        self.__ws: ClientConnection = ws
        self.__extractor_results: deque = extractor_results
        self.__running: Event = running

    def run(self) -> None:
        self.__logger.info("Thread start.")
        while self.__running.is_set():
            try:
                pack: str | bytes = self.__ws.recv(timeout=5)
                se_result: SpeechExtractorResult = SpeechExtractorResult.from_msgpack(
                    pack,
                )
                self.__logger.info(se_result)
                self.__extractor_results.append(se_result)
            except TimeoutError:
                pass  # タイムアウトした時のみやり直す。
            except ConnectionClosed:
                self.__logger.info("ConnectionClosed.")
                break
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}",
                )
                traceback.print_exc()
                break
        self.__logger.info("Thread terminated.")
        self.__running.clear()
