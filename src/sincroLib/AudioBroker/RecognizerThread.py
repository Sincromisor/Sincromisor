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
        self.logger: Logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")
        self.ws = ws
        self.extractor_results = extractor_results
        self.running = running
        self.session_id = session_id

    def pop_extractor_result(self):
        base_e_result: SpeechExtractorResult = self.extractor_results.popleft()

        # 音声認識に時間が掛かった場合、Extractorから複数の音声パケットが届いている
        # 場合がある。この場合は、各パケットの音声データを結合する。
        # パケットに音声の末端である(confirmed=Trueである)場合は、そこで結合を終了し返す。
        while len(self.extractor_results) > 0:
            e_result: SpeechExtractorResult = self.extractor_results.popleft()
            base_e_result.append_voice(e_result.voice)
            base_e_result.sequence_id = e_result.sequence_id
            if e_result.confirmed:
                return base_e_result.to_msgpack()
        return base_e_result.to_msgpack()

    def run(self):
        self.logger.info(f"Thread start.")
        try:
            last_ping = time.time()
            while self.running.is_set():
                if len(self.extractor_results) > 0:
                    self.ws.send(self.pop_extractor_result())
                else:
                    if last_ping < time.time() + 10:
                        self.ws.ping()
                        last_ping = time.time()
                    time.sleep(0.2)
        except ConnectionClosed:
            self.logger.info("ConnectionClosed.")
        except Exception as e:
            self.logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
        self.logger.info("Thread terminated.")


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
        self.logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")
        self.ws = ws
        self.recognizer_results = recognizer_results
        self.text_channel_queue = text_channel_queue
        self.running = running
        self.session_id = session_id

    def run(self):
        self.logger.info(f"Thread start.")
        while self.running.is_set():
            try:
                pack = self.ws.recv(timeout=5)
                sr_result = SpeechRecognizerResult.from_msgpack(pack)

                # to SynthesizerThread
                self.recognizer_results.append(sr_result)
                # to TextChannel
                self.text_channel_queue.append(sr_result)
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
