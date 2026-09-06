"""初期化処理のモデル検証を、外部操作を記録する代替コマンドで確認する。"""

import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
with tempfile.TemporaryDirectory() as directory:
    temporary = Path(directory)
    log = temporary / "calls"
    for name in ["chmod", "chown", "stat", "mc", "su"]:
        command = temporary / name
        command.write_text('#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$CHECK_LOG"\n')
        command.chmod(0o755)
    environment = {
        **os.environ,
        "PATH": f"{temporary}:/usr/bin:/bin",
        "CHECK_LOG": str(log),
    }
    for model in ["nue", "unknown", "", "nemo"]:
        result = subprocess.run(
            ["sh", str(ROOT / "Docker/service-initializer/initialize.sh")],
            env={**environment, "SINCRO_RECOGNIZER_MODEL": model},
            capture_output=True,
            text=True,
            check=False,
        )
        if model == "nemo":
            assert result.returncode == 0, result.stderr
            assert "hf download reazon-research/reazonspeech-nemo-v2" in log.read_text()
        else:
            assert result.returncode != 0
            assert "nemoを指定" in result.stderr
            assert not log.exists(), "未対応値で外部操作が実行された"
# reason: 単発の検証用スクリプトの結果を標準出力へ表示する。
print("初期化の正常系・未対応値の副作用前拒否: PASS")
