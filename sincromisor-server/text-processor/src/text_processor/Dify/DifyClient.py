"""DifyのHTTP応答を検証済みSSEイベントへ変換する。応答の確定判断は処理担当へ委ねる。"""

import json
import logging
from collections.abc import AsyncGenerator
from logging import Logger

import aiohttp
from pydantic import BaseModel


class DifyStreamEvent(BaseModel):
    """DifyのSSEで通知される、必要最小限のイベント表現。"""

    event: str
    answer: str | None = None
    conversation_id: str | None = None


class DifyResponseError(RuntimeError):
    """Difyが正常な応答として確定できないイベントを返したことを示す。"""


class DifyClient:
    """DifyのチャットSSEを非同期で読み、要求処理の取消時に接続を解放する。"""

    # 接続不能や無応答のDifyによって会話WebSocketの終了処理が停止しないよう、
    # 接続と各読み取りを30秒で打ち切る。応答全体の生成時間は制限しない。
    DEFAULT_TIMEOUT_SECONDS = 30.0

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        """管理下のDify接続先と認証情報、接続・無受信待ちの上限秒数を保持する。"""
        self.base_url = base_url
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)

    def __headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        inputs: dict[str, object],
        query: str,
        conversation_id: str | None,
    ) -> AsyncGenerator[DifyStreamEvent, None]:
        """チャット応答をSSE順に返す。

        セッションと応答はこの非同期生成器が所有する。呼び出し元が取消されると
        ``async with`` を抜けて接続を閉じるため、別スレッドの待機を残さない。
        """
        query_data: dict[str, object] = {
            "inputs": inputs,
            "query": query,
            "user": "username",
            "response_mode": "streaming",
            "files": None,
        }
        if conversation_id:
            query_data["conversation_id"] = conversation_id

        timeout = aiohttp.ClientTimeout(
            total=None,
            connect=self.timeout_seconds,
            sock_read=self.timeout_seconds,
        )
        async with (
            aiohttp.ClientSession(timeout=timeout) as session,
            session.post(
                f"{self.base_url}/chat-messages",
                json=query_data,
                headers=self.__headers(),
            ) as response,
        ):
            response.raise_for_status()
            async for raw_line in response.content:
                line = raw_line.decode("utf-8").strip()
                if not line.startswith("data:"):
                    continue
                response_data = line.removeprefix("data:").strip()
                if not response_data:
                    continue
                try:
                    event = DifyStreamEvent.model_validate(json.loads(response_data))
                except (json.JSONDecodeError, ValueError) as error:
                    raise ValueError("Invalid Dify stream response.") from error
                if event.event == "error":
                    raise DifyResponseError("Dify returned an error event.")
                yield event
