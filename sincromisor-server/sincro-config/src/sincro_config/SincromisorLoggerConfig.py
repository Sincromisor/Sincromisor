"""運用ログをJSONLへ統一し、内容記録の設定を起動時に検証する。"""

import json
import logging
import math
import os
import re
import traceback
from datetime import UTC, datetime
from pathlib import Path

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
        fields.update(
            timestamp=datetime.fromtimestamp(record.created, UTC).isoformat(),
            level=record.levelname.lower(),
            logger=record.name,
            message=message,
        )
        fields.setdefault("event", "log")
        if record.exc_info and record.exc_info[0]:
            fields["exception"] = {
                "type": record.exc_info[0].__name__,
                "frames": [
                    {
                        "file": Path(frame.filename).name,
                        "line": frame.lineno,
                        "function": frame.name,
                    }
                    for frame in traceback.extract_tb(record.exc_info[2])
                ],
            }
        return json.dumps(self._safe(fields), ensure_ascii=False, allow_nan=False)

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

    @staticmethod
    def conversation_enabled() -> bool:
        """未指定は有効とし、不正値自体をエラーへ含めず起動を失敗させる。"""
        key = "SINCRO_LOG_CONVERSATION_ENABLED"
        value = os.environ.get(key, "true")
        if value not in ("true", "false"):
            raise ValueError(f"{key}: expected true or false")
        return value == "true"

    @classmethod
    def generate(cls, log_file: str | None = None, stdout: bool = True) -> dict:
        """呼出しごとに独立した設定を作り、指定された出力先だけを開く。"""
        cls.conversation_enabled()
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
