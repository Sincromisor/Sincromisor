from collections.abc import Generator

from sincro_models import TextProcessorRequest, TextProcessorResult

from ..PokeText import PokeText
from .TextProcessorWorker import TextProcessorWorker


class PokeTextProcessorWorker(TextProcessorWorker):
    """新規入力を変換し、運用ログの本文制御は共通ワーカーへ委ねる。"""

    pokeText: PokeText = PokeText()

    def process(
        self,
        request: TextProcessorRequest,
    ) -> Generator[TextProcessorResult]:
        """要求本文を変換した増分と最後の確定結果を返す。変換失敗は呼び出し元へ伝える。"""
        response: TextProcessorResult = TextProcessorResult.from_request(
            message_type=self.message_type,
            speaker_id=self.speaker_id,
            speaker_name=self.speaker_name,
            request=request,
        )
        for text in PokeTextProcessorWorker.pokeText.convert(
            request.request_message.message,
        ):
            if response.append_response_message(text):
                yield response
        response.finalize()
        yield response
