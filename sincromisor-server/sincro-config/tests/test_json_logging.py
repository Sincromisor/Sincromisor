"""実ハンドラーでJSONL・例外の秘匿・再設定・ファイル出力を確認する。"""

import json
import os
import subprocess
import sys

import pytest
from sincro_config import SincromisorLoggerConfig


@pytest.mark.parametrize("value", [None, "true", "false", "", "TRUE", "secret-value"])
def test_conversation_setting(monkeypatch, value):
    key = "SINCRO_LOG_CONVERSATION_ENABLED"
    if value is None:
        monkeypatch.delenv(key, raising=False)
    else:
        monkeypatch.setenv(key, value)
    if value in (None, "true", "false"):
        assert SincromisorLoggerConfig.conversation_enabled() == (value != "false")
    else:
        with pytest.raises(ValueError, match=key) as error:
            SincromisorLoggerConfig.generate()
        assert "secret-value" not in str(error.value)


def test_real_handlers(tmp_path):
    script = """
import logging, logging.config, sys
from sincro_config import SincromisorLoggerConfig
library = logging.getLogger("nemo_logger")
library.addHandler(logging.StreamHandler())
library.propagate = False
for _ in range(2):
    logging.config.dictConfig(SincromisorLoggerConfig.generate(sys.argv[1]))
log = logging.getLogger("sincro.test")
log.info({"event": "test", "text": "日本語\\n本文", "token": "secret-value"})
log.info("event", extra={"session_id": "session-a", "sequence_id": 7})
try:
    raise ValueError("private-input Bearer secret-value")
except ValueError:
    log.exception("Processing failed.")
library.error("private-input Bearer secret-value")
logging.getLogger("uvicorn.access").info("GET /?text=private-input")
logging.shutdown()
"""
    path = tmp_path / "operation.jsonl"
    run = subprocess.run(
        [sys.executable, "-c", script, str(path)],
        capture_output=True,
        text=True,
        check=True,
        env=os.environ.copy(),
    )
    assert run.stderr == ""
    assert run.stdout == path.read_text()
    assert "private-input" not in run.stdout
    assert "secret-value" not in run.stdout
    rows = [json.loads(line) for line in run.stdout.splitlines()]
    assert len(rows) == 5
    assert rows[0]["text"] == "日本語\n本文"
    assert rows[1]["sequence_id"] == 7
    assert rows[2]["exception"]["type"] == "ValueError"
    assert rows[2]["exception"]["frames"]
    assert all(row["timestamp"] and row["level"] and row["logger"] for row in rows)
