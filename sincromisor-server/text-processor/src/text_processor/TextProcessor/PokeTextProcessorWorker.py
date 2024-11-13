from sincro_models import TextProcessorRequest, TextProcessorResult
from .TextProcessorWorker import TextProcessorWorker
from ..PokeText import PokeText
from collections.abc import Generator


class PokeTextProcessorWorker(TextProcessorWorker):
    pokeText: PokeText = PokeText()

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
        for text in PokeTextProcessorWorker.pokeText.convert(
            request.request_message.message
        ):
            self.logger.info(["Converted", text])
            response.append_response_message(text)
            yield response
        response.finalize()
        yield response
