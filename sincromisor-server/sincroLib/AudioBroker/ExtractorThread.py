import time
import logging
from logging import Logger
import traceback
from collections import deque
from threading import Thread, Event
from websockets.sync.client import ClientConnection
from websockets.exceptions import ConnectionClosed
from ..models import SpeechExtractorInitializeRequest, SpeechExtractorResult


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

    def run(self):
        self.__logger.info(f"Thread start.")
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


class ExtractorReceiverThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        extractor_results: deque,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        # self.extract_log = logging.getLogger(__name__ + f'[{session_id}]')
        # self.extract_log.addHandler(logging.FileHandler('log/Extractor.log', mode='a'))
        self.__ws: ClientConnection = ws
        self.__extractor_results: deque = extractor_results
        self.__running: Event = running
        self.__session_id: str = session_id

    def run(self):
        self.__logger.info(f"Thread start.")
        while self.__running.is_set():
            try:
                pack: bytes = self.__ws.recv(timeout=5)
                se_result: SpeechExtractorResult = SpeechExtractorResult.from_msgpack(
                    pack
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
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}"
                )
                traceback.print_exc()
                break
        self.__logger.info("Thread terminated.")
        self.__running.clear()
