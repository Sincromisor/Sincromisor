import time
import logging
from logging import Logger
from collections.abc import Generator
from fastapi import WebSocket
from sincro_models import TextProcessorRequest, TextProcessorResult
from ..PokeText import PokeText


class TextProcessorWorker:
    pokeText: PokeText = PokeText()

    def __init__(self):
        self.__logger: Logger = logging.getLogger("sincro." + __name__)

        self.message_type: str = "system"
        self.speaker_id: str = "system"
        self.speaker_name: str = "Glorious AI"

    async def communicate(self, ws: WebSocket) -> None:
        pack: bytes
        while pack := await ws.receive_bytes():
            request: TextProcessorRequest = TextProcessorRequest.from_msgpack(pack=pack)
            # 現状では、requestのテキストが完全に認識できたタイミングで処理をする
            if not request.confirmed:
                continue
            for response in self.__process_text(request=request):
                self.__logger.info(["send", response])
                await ws.send_bytes(response.to_msgpack())

    def __process_text(
        self,
        request: TextProcessorRequest,
    ) -> Generator[TextProcessorResult, None, None]:
        response: TextProcessorResult = TextProcessorResult.from_request(
            message_type=self.message_type,
            speaker_id=self.speaker_id,
            speaker_name=self.speaker_name,
            request=request,
        )
        for text in TextProcessorWorker.pokeText.convert(
            request.request_message.message
        ):
            self.__logger.info(["convertedText", text])
            response.append_response_message(text)
            yield response
        response.finalize()
        yield response
