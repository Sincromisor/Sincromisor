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
        self.logger: Logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")
        self.ws = ws
        self.running = running
        self.session_id = session_id
        self.frame_buffer = frame_buffer

    def run(self):
        self.logger.info(f"Thread start.")
        try:
            init_request = SpeechExtractorInitializeRequest(session_id=self.session_id)
            self.ws.send(init_request.to_msgpack())
            while self.running.is_set():
                try:
                    buffer = self.frame_buffer.popleft()
                    self.ws.send(buffer)
                except IndexError:
                    time.sleep(0.1)
            self.logger.info("Cancelled by another thread.")
        except ConnectionClosed:
            self.logger.info("ConnectionClosed.")
        except Exception as e:
            self.logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
        self.logger.info("Thread terminated.")
        self.running.clear()


class ExtractorReceiverThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        extractor_results: deque,
        running: Event,
        session_id: str,
    ):
        super().__init__()
        self.logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")
        # self.extract_log = logging.getLogger(__name__ + f'[{session_id}]')
        # self.extract_log.addHandler(logging.FileHandler('log/Extractor.log', mode='a'))
        self.ws = ws
        self.extractor_results = extractor_results
        self.running = running
        self.session_id = session_id

    def run(self):
        self.logger.info(f"Thread start.")
        while self.running.is_set():
            try:
                pack = self.ws.recv(timeout=5)
                se_result = SpeechExtractorResult.from_msgpack(pack)
                self.logger.info(se_result)
                self.extractor_results.append(se_result)
            except TimeoutError:
                pass  # タイムアウトした時のみやり直す。
            except ConnectionClosed:
                self.logger.info("ConnectionClosed.")
                break
            except Exception as e:
                self.logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
                traceback.print_exc()
                break
        self.logger.info("Thread terminated.")
        self.running.clear()
