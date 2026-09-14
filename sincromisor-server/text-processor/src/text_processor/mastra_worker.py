"""Mastra本文を既存の音声入力へ分割し、正常完了だけをチャット履歴へ確定する。"""

import re
from collections.abc import AsyncGenerator
from contextlib import aclosing

from sincro_models import TextProcessorRequest, TextProcessorResult

from .mastra_client import MastraClient
from .TextProcessor.TextProcessorWorker import TextProcessorWorker


class MastraTextProcessorWorker(TextProcessorWorker):
    """共通WebSocket処理の取消構造でMastraの非同期HTTPを所有する。"""

    def __init__(self, base_url: str, api_key: str, agent_id: str) -> None:
        """接続内で用いるAPI設定を保持し、会話履歴はMastraのMemoryへ委ねる。"""
        super().__init__()
        self.mastra_client = MastraClient(base_url, api_key, agent_id)

    async def process_async(
        self,
        request: TextProcessorRequest,
    ) -> AsyncGenerator[TextProcessorResult]:
        """句読点ごとに送り、成功したHTTP終端後だけ末尾と確定結果を渡す。

        表示用履歴はLLMへ再投入しない。表情コードの保持と除去は共通結果モデルへ
        委ね、送信失敗・切断時にはaclosingからHTTP読取りまで取消を伝える。
        """
        response = TextProcessorResult.from_request(
            message_type=self.message_type,
            speaker_id=self.speaker_id,
            speaker_name=self.speaker_name,
            request=request,
        )
        buffer = ""
        async with aclosing(
            self.mastra_client.chat(
                request.request_message.message, request.session_id
            ),
        ) as texts:
            async for text in texts:
                # 区切り文字を前の文へ残し、最後の未完部分だけ次の断片へ持ち越す。
                *sentences, buffer = re.split(r"(?<=[、。？！,.?!])", buffer + text)
                for sentence in sentences:
                    if response.append_response_message(sentence):
                        yield response
        if buffer and response.append_response_message(buffer):
            yield response
        response.finalize()
        yield response
