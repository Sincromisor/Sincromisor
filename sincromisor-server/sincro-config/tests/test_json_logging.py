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


@pytest.mark.parametrize(
    ("logger", "message", "operation"),
    [
        ("uvicorn.error", "Exception in ASGI application\n", "asgi"),
        ("uvicorn.error", "Invalid UTF-8 sequence received from client.", "decode"),
        ("websockets.server", "opening handshake failed", "open_handshake"),
        ("websockets.server", "closing handshake failed", "close_handshake"),
        ("websockets.server", "connection handler failed", "connection_handler"),
        ("uvicorn.error", "data transfer failed", "transfer"),
        ("websockets.client", "keepalive ping failed", "keepalive"),
    ],
)
def test_known_library_failure(logger, message, operation):
    import logging

    from sincro_config.SincromisorLoggerConfig import JsonLogFormatter

    try:
        try:
            raise TimeoutError("private-cause https://private-url")
        except TimeoutError as cause:
            raise RuntimeError("private-value") from cause
    except RuntimeError:
        record = logging.LogRecord(
            logger,
            logging.ERROR,
            __file__,
            99,
            message,
            ("private-args",),
            sys.exc_info(),
            "library_function",
        )
    output = JsonLogFormatter().format(record)
    row = json.loads(output)
    assert row["reason"] == "timeout"
    assert row["operation"] == operation
    assert row["exception_type"] == "TimeoutError"
    assert row["message"] == "Library event"
    assert row["exception"]["type"] == "RuntimeError"
    assert row["exception"]["causes"][0]["type"] == "TimeoutError"
    for exception in [row["exception"], *row["exception"]["causes"]]:
        assert exception["frames"][0]["file"] == "test_json_logging.py"
        assert exception["frames"][0]["function"] == "test_known_library_failure"
        assert exception["frames"][0]["line"] > 0
    assert "private-" not in output
    assert str(os.path.dirname(__file__)) not in output


@pytest.mark.parametrize(
    ("logger", "message"),
    [
        ("unknown.library", "keepalive ping failed"),
        ("uvicorn.access", "Exception in ASGI application\n"),
        ("uvicorn.error", "private-prefix keepalive ping failed"),
        ("websockets.server", "unknown private-template %s"),
        ("websockets.server", "- timed out waiting for keepalive pong"),
    ],
)
def test_unknown_library_log_stays_fixed(logger, message):
    import logging

    from sincro_config.SincromisorLoggerConfig import JsonLogFormatter

    error = ValueError("private-value")
    error.__cause__ = error
    record = logging.LogRecord(
        logger,
        logging.ERROR,
        __file__,
        99,
        message,
        ("private-args",),
        (type(error), error, None),
        "library_function",
    )
    row = json.loads(JsonLogFormatter().format(record))
    assert "reason" not in row
    assert row["function"] == "library_function"
    assert row["line"] == 99
    assert row["exception"] == {"type": "ValueError", "frames": []}
    assert "private-" not in json.dumps(row)


def test_exception_chain_is_bounded():
    import logging

    from sincro_config.SincromisorLoggerConfig import JsonLogFormatter

    error = RuntimeError("private-root")
    for _ in range(10):
        outer = RuntimeError("private-cause")
        outer.__cause__ = error
        error = outer
    record = logging.LogRecord(
        "websockets.server",
        logging.ERROR,
        __file__,
        1,
        "connection handler failed",
        (),
        (type(error), error, None),
    )
    row = json.loads(JsonLogFormatter().format(record))
    assert len(row["exception"]["causes"]) == 3
    assert row["reason"] == "failed"
    assert "private-" not in json.dumps(row)


def test_deep_traceback_retains_origin():
    import logging

    from sincro_config.SincromisorLoggerConfig import JsonLogFormatter

    def origin():
        raise ValueError("private-origin")

    def wrapper(depth):
        if depth:
            wrapper(depth - 1)
        else:
            origin()

    try:
        wrapper(40)
    except ValueError:
        record = logging.LogRecord(
            "uvicorn.error",
            logging.ERROR,
            __file__,
            1,
            "Exception in ASGI application\n",
            (),
            sys.exc_info(),
        )
    row = json.loads(JsonLogFormatter().format(record))
    frames = row["exception"]["frames"]
    assert len(frames) == 32
    assert frames[-1]["function"] == "origin"
    assert "private-origin" not in json.dumps(row)
