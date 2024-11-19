import logging
import time
import traceback
from collections import deque
from logging import Logger
from threading import Event, Thread

from sincro_models import (
    SpeechExtractorInitializeRequest,
)
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import ClientConnection


class ExtractorSenderThread(Thread):
    def __init__(
        self, ws: ClientConnection, running: Event, session_id: str, frame_buffer: deque
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        self.__ws: ClientConnection = ws
        self.__running: Event = running
        self.__session_id: str = session_id
        self.__frame_buffer: deque = frame_buffer

    def run(self) -> None:
        self.__logger.info("Thread start.")
        try:
            init_request = SpeechExtractorInitializeRequest(
                session_id=self.__session_id
            )
            self.__ws.send(init_request.to_msgpack())
            while self.__running.is_set():
                try:
                    buffer: bytes = self.__frame_buffer.popleft()
                    self.__ws.send(buffer)
                except IndexError:
                    time.sleep(0.1)
            self.__logger.info("Cancelled by another thread.")
        except ConnectionClosed:
            self.__logger.info("ConnectionClosed.")
        except Exception as e:
            self.__logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
        self.__logger.info("Thread terminated.")
        self.__running.clear()
