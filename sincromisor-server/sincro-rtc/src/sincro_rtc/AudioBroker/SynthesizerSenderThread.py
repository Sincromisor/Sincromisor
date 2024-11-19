import logging
import time
import traceback
from collections import deque
from logging import Logger
from threading import Event, Thread

from sincro_models import TextProcessorResult
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import ClientConnection


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
            __name__ + f"[{self.__session_id[21:26]}]",
        )
        self.__ws: ClientConnection = ws
        self.__text_processor_results: deque = text_processor_results
        self.__running: Event = running

    def run(self) -> None:
        self.__logger.info("Thread start.")
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
