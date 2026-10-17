"""運用ログをJSONLへ統一し、内容記録の設定を起動時に検証する。"""

import json
import logging
import math
import os
import re
import traceback
from collections import deque
from datetime import UTC, datetime
from pathlib import Path

from .runtime_diagnostics import failure_fields

_RECORD_FIELDS = set(logging.makeLogRecord({}).__dict__) | {
    "message",
    "asctime",
    "fields",
}


class JsonLogFormatter(logging.Formatter):
    """本文を含み得る例外値・ローカル変数・第三者の引数を運用ログへ展開しない。"""

    def format(self, record: logging.LogRecord) -> str:
        """共有レコードを変更せず、構造付き属性と安全な例外位置を1行へ変換する。"""
        fields: dict[str, object] = (
            dict(record.msg) if isinstance(record.msg, dict) else {}
        )
        fields.update(
            {
                key: value
                for key, value in record.__dict__.items()
                if key not in _RECORD_FIELDS
            }
        )
        fields.update(getattr(record, "fields", {}))
        chain = self._exception_chain(record)
        internal = record.name.startswith("sincro.")
        if internal:
            message = (
                fields.pop("message", fields.get("event", "structured event"))
                if isinstance(record.msg, dict)
                else record.getMessage()
            )
        else:
            # 第三者のメッセージにはHTTP本文・URL・認証値が入るため、種類と位置だけを残す。
            message = "Library event"
            fields = {
                "event": "library_log",
                "function": record.funcName,
                "line": record.lineno,
            }
            fields.update(self._library_failure(record, chain))
        fields.update(
            timestamp=datetime.fromtimestamp(record.created, UTC).isoformat(),
            level=record.levelname.lower(),
            logger=record.name,
            message=message,
        )
        fields.setdefault("event", "log")
        if chain:
            locations = [self._exception_location(error) for error in chain]
            fields["exception"] = locations[0]
            if len(locations) > 1:
                locations[0]["causes"] = locations[1:]
        return json.dumps(self._safe(fields), ensure_ascii=False, allow_nan=False)

    @staticmethod
    def _exception_chain(record: logging.LogRecord) -> list[BaseException]:
        """原因を最大4段に制限し、循環と明示的に隠したcontextをたどらない。"""
        chain: list[BaseException] = []
        error = record.exc_info[1] if record.exc_info else None
        while error is not None and len(chain) < 4:
            if any(error is previous for previous in chain):
                break
            chain.append(error)
            error = error.__cause__ or (
                None if error.__suppress_context__ else error.__context__
            )
        return chain

    @staticmethod
    def _exception_location(error: BaseException) -> dict[str, object]:
        """ソースを読まず、例外値を含まない位置だけを発生箇所側の最大32フレーム残す。"""
        frames = deque(maxlen=32)
        for frame, line in traceback.walk_tb(error.__traceback__):
            frames.append(
                {
                    "file": Path(frame.f_code.co_filename).name,
                    "line": line,
                    "function": frame.f_code.co_name,
                }
            )
        return {"type": type(error).__name__, "frames": list(frames)}

    @staticmethod
    def _library_failure(
        record: logging.LogRecord, chain: list[BaseException]
    ) -> dict[str, object]:
        """採用版のloggerと未展開の固定雛形だけを認識し、argsは参照しない。"""
        if record.name not in {
            "uvicorn.error",
            "websockets.server",
            "websockets.client",
            "websockets.protocol",
        } or not isinstance(record.msg, str):
            return {}
        operations = {
            "opening handshake failed": "open_handshake",
            "closing handshake failed": "close_handshake",
            "connection handler failed": "connection_handler",
            "data transfer failed": "transfer",
            "keepalive ping failed": "keepalive",
        }
        if record.name == "uvicorn.error":
            operations["Exception in ASGI application\n"] = "asgi"
            operations["Invalid UTF-8 sequence received from client."] = "decode"
        operation = operations.get(record.msg)
        if operation is None:
            return {}
        fields: dict[str, object] = {"operation": operation, "reason": "failed"}
        for error in chain:
            cause = failure_fields(error)
            fields.update(cause)
            if cause["reason"] != "failed":
                break
        return fields

    @classmethod
    def _safe(cls, value: object) -> object:
        """認証属性を除き、未対応のモデルをreprへ暗黙変換しない。"""
        if isinstance(value, dict):
            return {
                str(key): cls._safe(item)
                for key, item in value.items()
                if not re.search(
                    r"authorization|token|password|secret|private_key|^headers$",
                    str(key),
                    re.IGNORECASE,
                )
            }
        if isinstance(value, (list, tuple)):
            return [cls._safe(item) for item in value]
        if isinstance(value, str):
            return re.sub(r"(?i)Bearer\s+[^\s\"']+", "Bearer [REDACTED]", value)
        if isinstance(value, float) and not math.isfinite(value):
            return None
        if value is None or isinstance(value, (bool, int, float)):
            return value
        return {"type": type(value).__name__}


class SincromisorLoggerConfig:
    """各プロセスが共有する出力先と、厳密な対話内容スイッチ。"""

    @classmethod
    def conversation_enabled(cls) -> bool:
        """認識・対話本文のスイッチを検証する。音声生成とは独立して扱う。"""
        return cls._enabled("SINCRO_LOG_CONVERSATION_ENABLED")

    @classmethod
    def synthesis_enabled(cls) -> bool:
        """読み上げ本文と生成条件のスイッチを検証する。"""
        return cls._enabled("SINCRO_LOG_SYNTHESIS_ENABLED")

    @staticmethod
    def _enabled(key: str) -> bool:
        """未指定は有効とし、不正値自体をエラーへ含めず起動を失敗させる。"""
        value = os.environ.get(key, "true")
        if value not in ("true", "false"):
            raise ValueError(f"{key}: expected true or false")
        return value == "true"

    @classmethod
    def generate(cls, log_file: str | None = None, stdout: bool = True) -> dict:
        """呼出しごとに独立した設定を作り、指定された出力先だけを開く。"""
        cls.conversation_enabled()
        cls.synthesis_enabled()
        logging.captureWarnings(True)
        handlers = {}
        if stdout:
            handlers["default"] = {
                "class": "logging.StreamHandler",
                "formatter": "json",
                "stream": "ext://sys.stdout",
            }
        if log_file:
            handlers["log_file"] = {
                "class": "logging.handlers.RotatingFileHandler",
                "formatter": "json",
                "filename": log_file,
                "maxBytes": 10485760,
                "backupCount": 100,
                "encoding": "utf8",
            }
        # 既存の第三者ハンドラーもrootへ集約し、独自書式からの迂回出力を防ぐ。
        names = set(logging.root.manager.loggerDict) | {
            "uvicorn",
            "uvicorn.error",
            "uvicorn.access",
            "nemo_logger",
        }
        return {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"json": {"()": JsonLogFormatter}},
            "handlers": handlers,
            "loggers": {name: {"handlers": [], "propagate": True} for name in names},
            "root": {"level": "INFO", "handlers": list(handlers)},
        }
