"""MastraのHTTPストリームを検証し、正常完了までユーザー向け本文だけを取り出す。"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import aclosing
from time import perf_counter
from urllib.parse import quote

import aiohttp
from pydantic import BaseModel, ConfigDict, Field
from sincro_config.runtime_diagnostics import failure_fields


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
    """正常な回答として確定できない配信を、本文を含まない理由で区別する。"""

    def __init__(self, message: str, reason: str = "invalid_stream") -> None:
        super().__init__(message)
        self.reason = reason


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
        """HTTP/SSEの正常終端・取消・失敗を区別し、URL・要求・応答は記録しない。"""
        started = perf_counter()
        diagnostic: dict[str, object] = {
            "event": "agent_stream",
            "peer": "agent_server",
            "stage": "stream",
            "session_id": session_id,
            "outcome": "success",
        }
        try:
            async with aclosing(self._chat(query, session_id)) as stream:
                async for text in stream:
                    yield text
        except asyncio.CancelledError, GeneratorExit:
            diagnostic.update(outcome="cancelled", reason="cancelled")
            raise
        except Exception as error:
            diagnostic.update(failure_fields(error))
            diagnostic["outcome"] = "failed"
            if isinstance(error, aiohttp.ClientResponseError):
                diagnostic["stage"] = "http"
            elif isinstance(error, MastraResponseError):
                diagnostic["reason"] = error.reason
            raise
        finally:
            diagnostic["duration_ms"] = (perf_counter() - started) * 1000
            logging.getLogger("sincro.MastraClient").info(diagnostic)

    async def _chat(self, query: str, session_id: str) -> AsyncGenerator[str]:
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
                    raise MastraResponseError(
                        "Mastra interrupted the response.",
                        reason="remote_abort"
                        if event.type == "abort"
                        else "remote_error",
                    )
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
            raise MastraResponseError(
                "Mastra stream ended before [DONE].", reason="unexpected_eof"
            )
