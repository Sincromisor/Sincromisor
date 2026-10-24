"""接続内だけの識別子と処理段階を記録し、ワーカーの主原因を後始末から分離する。"""

import asyncio
from collections.abc import Generator
from contextlib import contextmanager
from logging import Logger
from uuid import uuid4

from .runtime_diagnostics import failure_fields


class WebSocketDiagnostics:
    """入口が所有し、同じ接続のワーカーへ渡す診断状態。通信データへは追加しない。"""

    def __init__(self, logger: Logger) -> None:
        """要求受信前には会話IDを推測せず、接続だけを識別する。"""
        self.logger = logger
        self.connection_id = uuid4().hex
        self.ids: dict[str, object] = {}
        self.failure: dict[str, object] | None = None
        self.error: BaseException | None = None
        self.accept_failures = True

    def start(self) -> None:
        """接続入口の開始を記録する。accept成功とは同一視しない。"""
        self.logger.info(
            {"event": "websocket_started", "connection_id": self.connection_id}
        )

    @contextmanager
    def operation(self, stage: str) -> Generator[None]:
        """並行受信と応答処理でも、最初に失敗した操作と当時のIDだけを保持する。"""
        try:
            yield
        except BaseException as error:
            if self.accept_failures and self.failure is None:
                self.failure = {"operation": stage, **self.ids}
                self.error = error
            raise

    def finish(self, error: BaseException | None = None) -> None:
        """終了コードは取得値だけを記録し、相手の自由文を固定理由へ制限する。"""
        error = self.error or error
        fields: dict[str, object] = {
            "event": "websocket_finished",
            "connection_id": self.connection_id,
            **(
                self.failure
                or {"operation": "initialize" if error else "process", **self.ids}
            ),
            "outcome": "normal",
        }
        if error is not None:
            fields.update(failure_fields(error))
            fields["outcome"] = (
                "cancelled" if isinstance(error, asyncio.CancelledError) else "failed"
            )
            if type(error).__name__ == "WebSocketDisconnect":
                code = getattr(error, "code", None)
                if type(code) is int:
                    fields["close_code"] = code
                fields["close_reason"] = (
                    "keepalive_ping_timeout"
                    if getattr(error, "reason", None) == "keepalive ping timeout"
                    else "unknown"
                )
                if code in (1000, 1001):
                    fields["outcome"] = "normal"
                    fields["reason"] = "remote_close"
        log = self.logger.warning if fields["outcome"] == "failed" else self.logger.info
        log(fields)

    def cleanup_failed(self, error: Exception) -> None:
        """二次例外を別イベントにし、主原因を上書きしない。"""
        self.logger.warning(
            {
                "event": "websocket_cleanup_failed",
                "connection_id": self.connection_id,
                **self.ids,
                **failure_fields(error),
            }
        )
