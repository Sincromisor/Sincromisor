from collections import deque
from collections.abc import Generator
from threading import Event, Thread

from sincro_models import TextProcessorRequest, TextProcessorResult

from ..Dify import DifyClient
from .TextProcessorWorker import TextProcessorWorker


class DifyTextProcessorWorker(TextProcessorWorker):
    def __init__(self, base_url: str, api_key: str):
        super().__init__()
        self.dify_client: DifyClient = DifyClient(base_url=base_url, api_key=api_key)
        self.conversation_id: str | None = None

    def process(
        self,
        request: TextProcessorRequest,
    ) -> Generator[TextProcessorResult, None, None]:
        response: TextProcessorResult = TextProcessorResult.from_request(
            message_type=self.message_type,
            speaker_id=self.speaker_id,
            speaker_name=self.speaker_name,
            request=request,
        )
        responses = deque([], 10)
        event = Event()
        self.logger.info(["Request", request.request_message.message])
        t = Thread(
            target=self.__dify_client_thread,
            args=(request.request_message.message, responses, event),
        )
        t.start()

        while True:
            try:
                res_text: str = responses.popleft()
                self.logger.info(["Generated", res_text])
                response.append_response_message(res_text)
                yield response
            except IndexError:
                if event.is_set():
                    break
                continue
        t.join(timeout=1)

        response.finalize()
        yield response

    def __dify_client_thread(
        self,
        request: str,
        responses: deque,
        event: Event,
    ) -> None:
        try:
            buffer: str = ""
            for response in self.dify_client.chat(
                inputs={},
                query=request,
                conversation_id=self.conversation_id,
            ):
                match response["event"]:
                    case "message":
                        buffer += response["answer"]
                        char: str
                        send_buffer: str = ""
                        for char in buffer:
                            send_buffer += char
                            # これらの記号が出現したら文の区切りとみなし、レスポンスとして返す。
                            if char in ["、", "。", "？", "！", ",", ".", "?", "!"]:
                                responses.append(send_buffer)
                                send_buffer = ""
                        buffer = send_buffer
                    case _:
                        pass
                self.conversation_id = response["conversation_id"]
        finally:
            event.set()
