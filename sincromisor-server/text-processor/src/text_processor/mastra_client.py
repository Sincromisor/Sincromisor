"""MastraのHTTPストリームを検証し、正常完了までユーザー向け本文だけを取り出す。"""

from collections.abc import AsyncGenerator
from urllib.parse import quote

import aiohttp
from pydantic import BaseModel, ConfigDict, Field


class _StepResult(BaseModel):
    """途中ステップとは区別して、会話全体の成功理由を検証する。"""

    model_config = ConfigDict(strict=True, hide_input_in_errors=True)
    reason: str
    is_continued: bool = Field(alias="isContinued")


class _Payload(BaseModel):
    """本文と最終理由だけを受け、ツール入力・結果・推論は保持しない。"""

    model_config = ConfigDict(strict=True, hide_input_in_errors=True)
    text: str | None = None
    step_result: _StepResult | None = Field(default=None, alias="stepResult")


class _Event(BaseModel):
    """Mastraの実HTTP形式を境界で検証し、不正入力を例外表示へ含めない。"""

    model_config = ConfigDict(strict=True, hide_input_in_errors=True)
    type: str = Field(min_length=1)
    payload: _Payload | None = None


class MastraResponseError(RuntimeError):
    """正常な回答として確定できないMastraの配信を示す。"""


class MastraClient:
    """一発話のHTTP接続を所有し、読取り取消時に応答とセッションを閉じる。"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        agent_id: str,
        timeout_seconds: float = 30.0,
    ) -> None:
        """管理下のAPIと認証情報、接続・無受信待ちの上限秒数を保持する。"""
        self.url = (
            f"{base_url.rstrip('/')}/api/agents/{quote(agent_id, safe='')}/stream"
        )
        self.api_key = api_key
        # ツール待ちも無受信時間へ含める。本文が届き続ける生成全体は制限しない。
        self.timeout = aiohttp.ClientTimeout(
            total=None,
            connect=timeout_seconds,
            sock_read=timeout_seconds,
        )

    async def chat(self, query: str, session_id: str) -> AsyncGenerator[str]:
        """新しい発話だけを対応threadへ送り、成功finishと[DONE]を受けて終了する。

        呼出元は生成器をaclosingで所有する。HTTP失敗・不正イベント・異常終端・
        途中EOFを例外として伝え、取消時も再試行せず接続を解放する。
        """
        async with (
            aiohttp.ClientSession(timeout=self.timeout) as session,
            session.post(
                self.url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "messages": [{"role": "user", "content": query}],
                    "memory": {
                        "resource": "sincromisor-local",
                        "thread": f"sincromisor:{session_id}",
                    },
                },
            ) as response,
        ):
            response.raise_for_status()
            finished = False
            data: list[str] = []
            async for raw_line in response.content:
                line = raw_line.decode("utf-8").rstrip("\r\n")
                # SSEの空行でイベントを確定する。コメントやevent/id行は本文にしない。
                if line.startswith("data:"):
                    data.append(line[5:].removeprefix(" "))
                if line or not data:
                    continue
                value = "\n".join(data)
                data.clear()
                if value == "[DONE]":
                    if not finished:
                        raise MastraResponseError(
                            "Mastra ended without a successful finish."
                        )
                    return
                if finished:
                    raise MastraResponseError("Mastra sent an event after finish.")
                event = _Event.model_validate_json(value)
                if event.type in {"error", "abort"}:
                    raise MastraResponseError("Mastra interrupted the response.")
                if event.type == "text-delta":
                    if event.payload is None or event.payload.text is None:
                        raise MastraResponseError("Mastra text-delta is missing text.")
                    yield event.payload.text
                elif event.type == "finish":
                    result = event.payload.step_result if event.payload else None
                    if result is None or result.reason != "stop" or result.is_continued:
                        raise MastraResponseError(
                            "Mastra response did not finish successfully."
                        )
                    finished = True
                # step-finishやツール・推論通知は最終結果でも読み上げ本文でもない。
            raise MastraResponseError("Mastra stream ended before [DONE].")
