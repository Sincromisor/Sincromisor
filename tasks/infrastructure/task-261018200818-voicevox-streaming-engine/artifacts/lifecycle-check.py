"""実際の起動スクリプトを一時領域へ展開し、子の終了と登録解除を模擬検証する。"""

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SOURCE = (ROOT / "Docker/voicevox/start-voicevox.sh").read_text()

# 実際の共通登録処理とtimeoutを通し、外部のEngineとConsulだけを模擬する。
CONSUL = """import os, sys, time
from pathlib import Path
d = Path(os.environ['CASE_DIR'])
mode = os.environ['CASE_MODE']
if sys.argv[2] == 'deregister':
    with (d/'events').open('a') as f: f.write('deregister\\n')
    sys.exit(0)
count = int((d/'count').read_text()) + 1 if (d/'count').exists() else 1
(d/'count').write_text(str(count))
with (d/'events').open('a') as f: f.write('register\\n')
if count > 1:
    if mode == 'registration-failure': sys.exit(7)
    if mode in ('registration-in-flight', 'registration-timeout'):
        (d/'blocked.pid').write_text(str(os.getpid()))
        time.sleep(60)
"""
ENGINE = """import os, signal, sys, time
from pathlib import Path
d = Path(os.environ['CASE_DIR'])
(d/'engine.pid').write_text(str(os.getpid()))
signal.signal(signal.SIGTERM, lambda *args: sys.exit(0))
if os.environ['CASE_MODE'] == 'engine-failure':
    time.sleep(0.1)
    sys.exit(9)
while True: time.sleep(0.01)
"""


def run_case(directory: Path, mode: str) -> dict[str, object]:
    """各状態へ進めて信号または子の失敗を起こし、終了値・解除・子の残存を照合する。"""
    directory.mkdir()
    consul = directory / "consul"
    consul.write_text(f"#!{sys.executable}\n{CONSUL}")
    consul.chmod(0o755)
    engine = directory / "engine.py"
    engine.write_text(ENGINE)
    script = directory / "start.sh"
    script.write_text(
        SOURCE.replace(
            ". /service-register.sh", f". {ROOT}/Docker/common/service-register.sh"
        )
        .replace(
            'TEMPLATE_JSON="/home/voicevox/.local/voicevox-template.json"',
            f'TEMPLATE_JSON="{directory}/template"',
        )
        .replace("/bin/consul", str(consul))
        .replace(
            "/opt/voicevox_engine/.venv/bin/python /opt/voicevox_engine/run.py",
            f"{sys.executable} {engine}",
        )
        .replace("sleep 30 &", "sleep 0.15 &")
    )
    (directory / "template").write_text(
        '{"id":"SERVICE_ID","address":"SERVICE_IPV4_ADDRESS"}'
    )
    environment = os.environ | {
        "CASE_DIR": str(directory),
        "CASE_MODE": mode,
        "SINCRO_CONSUL_AGENT_HOST": "test",
        "SINCRO_CONSUL_AGENT_PORT": "8500",
        "SINCRO_VOICEVOX_HOST": "0.0.0.0",
        "SINCRO_VOICEVOX_PORT": "50021",
    }
    process = subprocess.Popen(
        ["bash", str(script)],
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    try:
        marker = directory / (
            "blocked.pid" if mode == "registration-in-flight" else "engine.pid"
        )
        deadline = time.monotonic() + 3
        while (
            not marker.exists()
            and process.poll() is None
            and time.monotonic() < deadline
        ):
            time.sleep(0.01)
        if not marker.exists():
            raise RuntimeError(f"Scenario did not become ready: {mode}")
        started = time.monotonic()
        if mode in ("term", "int", "registration-in-flight"):
            process.send_signal(signal.SIGINT if mode == "int" else signal.SIGTERM)
        output = process.communicate(timeout=10)[0].decode()
        expected = {
            "engine-failure": 9,
            "registration-failure": 7,
            "registration-timeout": 124,
        }.get(mode, 0)
        events = (directory / "events").read_text().splitlines()
        remaining = []
        for file in directory.glob("*.pid"):
            try:
                os.kill(int(file.read_text()), 0)
                remaining.append(file.name)
            except ProcessLookupError:
                # プロセスが存在しないことがこの検証の成功条件である。
                pass
        if process.returncode != expected or events[-1] != "deregister" or remaining:
            raise RuntimeError(
                f"Lifecycle failed: {mode}, {process.returncode}, {events}, {remaining}, {output}"
            )
        return {
            "case": mode,
            "exit_code": process.returncode,
            "stop_seconds": round(time.monotonic() - started, 3),
            "deregistered": True,
            "remaining_children": remaining,
        }
    finally:
        # 検証失敗でも、この試験が作ったプロセス群だけを終了して回収する。
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()


def main() -> None:
    """通常信号、子の異常終了、登録応答待ちと時間切れの6条件を実行する。"""
    with tempfile.TemporaryDirectory(prefix="voicevox-lifecycle-") as temporary:
        results = [
            run_case(Path(temporary) / mode, mode)
            for mode in (
                "term",
                "int",
                "engine-failure",
                "registration-failure",
                "registration-in-flight",
                "registration-timeout",
            )
        ]
    sys.stdout.write(json.dumps(results, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
