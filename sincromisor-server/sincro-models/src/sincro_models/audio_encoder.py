"""認識音声保存と音声合成が共有する、既存エンコーダー呼出しの診断境界。"""

import logging
import subprocess
from time import perf_counter

from sincro_config.runtime_diagnostics import failure_fields, stderr_fields


def encode_audio(command: list[str], voice: bytes, ids: dict[str, object]) -> bytes:
    """一度だけ実行して成功出力を返す。失敗は原例外を保ち、診断には入力・引数を含めない。"""
    started = perf_counter()
    try:
        return subprocess.run(
            command, input=voice, capture_output=True, check=True
        ).stdout
    except (OSError, subprocess.SubprocessError) as error:
        stderr = (
            error.stderr if isinstance(error, subprocess.CalledProcessError) else b""
        )
        diagnostic = {
            "event": "audio_command_failure",
            "stage": "encode",
            "command": command[0] if command[0] in {"opusenc", "fdkaac"} else "unknown",
            **ids,
            **failure_fields(error),
            **stderr_fields(stderr or b""),
            "exit_code": error.returncode
            if isinstance(error, subprocess.CalledProcessError)
            else -1,
            "duration_ms": (perf_counter() - started) * 1000,
        }
        logging.getLogger("sincro.audio_encoder").exception(diagnostic)
        raise
