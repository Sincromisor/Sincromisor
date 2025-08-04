import logging
import traceback
from collections import deque
from threading import Event, Thread

from sincro_models import TextProcessorResult
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import ClientConnection
from websockets.typing import Data


class TextProcessorReceiverThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        running: Event,
        session_id: str,
        text_processor_results: deque,
        text_channel_queue: deque,
    ):
        super().__init__()
        self.__session_id: str = session_id
        self.__logger = logging.getLogger(
            "sincro." + self.__class__.__name__ + f"[{self.__session_id[21:26]}]"
        )
        self.__ws: ClientConnection = ws
        self.__text_channel_queue: deque = text_channel_queue
        self.__text_processor_results: deque = text_processor_results
        self.__running: Event = running

    def run(self) -> None:
        self.__logger.info("Thread start.")
        while self.__running.is_set():
            try:
                pack: Data = self.__ws.recv(timeout=5)
                assert isinstance(pack, bytes)
                tp_result: TextProcessorResult = TextProcessorResult.from_msgpack(pack)
                # to SynthesizerThread
                self.__text_processor_results.append(tp_result)
                # to TextChannel
                self.__text_channel_queue.append(tp_result.response_message)
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
