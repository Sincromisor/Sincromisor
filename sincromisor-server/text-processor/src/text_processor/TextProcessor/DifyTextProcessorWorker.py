"""DifyのSSE本文を文単位の音声入力とチャット本文へ変換し、正常終端だけを履歴へ確定する。"""

from collections.abc import AsyncGenerator
from contextlib import aclosing

from sincro_models import TextProcessorRequest, TextProcessorResult

from ..Dify import DifyClient, DifyResponseError
from .TextProcessorWorker import TextProcessorWorker


class DifyTextProcessorWorker(TextProcessorWorker):
    """Difyの非同期SSEを既存のTextProcessorResultストリームへ変換する。"""

    def __init__(self, base_url: str, api_key: str) -> None:
        """WebSocket接続内で共有するDifyクライアントと会話IDを初期化する。"""
        super().__init__()
        self.dify_client: DifyClient = DifyClient(base_url=base_url, api_key=api_key)
        self.conversation_id: str | None = None

    async def process_async(
        self,
        request: TextProcessorRequest,
    ) -> AsyncGenerator[TextProcessorResult, None]:
        """文末ごとに結果を送り、SSEが正常終了した時だけ応答を確定する。

        DifyClientの生成器をこの要求処理が所有するため、WebSocket切断による取消は
        HTTP応答へ伝わる。通知イベントには本文や会話IDを補わず、そのまま無視する。
        """
        response: TextProcessorResult = TextProcessorResult.from_request(
            message_type=self.message_type,
            speaker_id=self.speaker_id,
            speaker_name=self.speaker_name,
            request=request,
        )
        buffer = ""
        completed = False
        async with aclosing(
            self.dify_client.chat(
                inputs={},
                query=request.request_message.message,
                conversation_id=self.conversation_id,
            ),
        ) as events:
            async for event in events:
                if event.event == "message_end":
                    completed = True
                    break
                if event.event != "message":
                    continue
                if event.answer is None:
                    raise ValueError("Dify message event is missing answer.")
                if event.conversation_id is not None:
                    self.conversation_id = event.conversation_id
                buffer += event.answer
                for text in self.__take_sentences(buffer):
                    if response.append_response_message(text):
                        yield response
                buffer = self.__remaining_text(buffer)

        if not completed:
            raise DifyResponseError("Dify stream ended without message_end.")
        if buffer and response.append_response_message(buffer):
            yield response
        response.finalize()
        yield response

    @staticmethod
    def __take_sentences(text: str) -> list[str]:
        """音声合成へ渡せる、終端記号までの文だけを入力順に取り出す。"""
        sentences: list[str] = []
        start = 0
        for index, char in enumerate(text):
            if char in "、。？！,.?!":
                sentences.append(text[start : index + 1])
                start = index + 1
        return sentences

    @staticmethod
    def __remaining_text(text: str) -> str:
        """直近の終端記号以降を次のSSE片へ持ち越す。"""
        for index in range(len(text) - 1, -1, -1):
            if text[index] in "、。？！,.?!":
                return text[index + 1 :]
        return text
