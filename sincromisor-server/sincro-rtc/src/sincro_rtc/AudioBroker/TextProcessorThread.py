import time
import logging
import traceback
from collections import deque
from threading import Thread, Event
from websockets.sync.client import ClientConnection
from websockets.exceptions import ConnectionClosed
from sincro_models import (
    SpeechRecognizerResult,
    TextProcessorRequest,
    TextProcessorResult,
    ChatHistory,
    ChatMessage,
)


class TextProcessorSenderThread(Thread):
    def __init__(
        self,
        ws: ClientConnection,
        running: Event,
        session_id: str,
        recognizer_results: deque,
    ):
        super().__init__()
        self.__session_id: str = session_id
        self.__logger = logging.getLogger(__name__ + f"[{self.__session_id[21:26]}]")
        self.__ws: ClientConnection = ws
        self.__recognizer_results: deque = recognizer_results
        self.__running: Event = running

    def __create_request(self, chat_history: ChatHistory) -> TextProcessorRequest:
        rec_result: SpeechRecognizerResult = self.__recognizer_results.popleft()
        request_message = ChatMessage(
            message_type="user",
            speaker_id="user",
            speaker_name="User",
            message=rec_result.result_text(),
        )
        if rec_result.confirmed:
            chat_history.append(request_message)
        request: TextProcessorRequest = TextProcessorRequest(
            session_id=rec_result.session_id,
            speech_id=rec_result.speech_id,
            sequence_id=rec_result.sequence_id,
            confirmed=rec_result.confirmed,
            history=chat_history,
            request_message=request_message,
        )
        return request

    def run(self) -> None:
        self.__logger.info(f"Thread start.")
        try:
            chat_history: ChatHistory = ChatHistory()
            last_ping: float = time.time()
            while self.__running.is_set():
                if len(self.__recognizer_results) > 0:
                    self.__ws.send(
                        self.__create_request(chat_history=chat_history).to_msgpack()
                    )
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
        self.__logger = logging.getLogger(__name__ + f"[{self.__session_id[21:26]}]")
        self.__ws: ClientConnection = ws
        self.__text_channel_queue: deque = text_channel_queue
        self.__text_processor_results: deque = text_processor_results
        self.__running: Event = running

    def run(self) -> None:
        self.__logger.info(f"Thread start.")
        while self.__running.is_set():
            try:
                pack: bytes = self.__ws.recv(timeout=5)
                tp_result: TextProcessorResult = TextProcessorResult.from_msgpack(pack)
                # to SynthesizerThread
                self.__text_processor_results.append(tp_result)
                # to TextChannel
                self.__text_channel_queue.append(tp_result)
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
