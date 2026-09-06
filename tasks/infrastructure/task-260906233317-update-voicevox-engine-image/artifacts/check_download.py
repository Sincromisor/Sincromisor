"""Dockerfileの取得処理を実行し、HTTP失敗後のキャッシュと再試行を確認する。"""

import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread


class Handler(BaseHTTPRequestHandler):
    """最初だけHTTPエラーを返し、次の要求で配布物の代替データを返す。"""

    calls = 0

    def do_GET(self) -> None:
        """取得失敗と成功を順に返す。"""
        type(self).calls += 1
        self.send_response(503 if self.calls == 1 else 200)
        self.end_headers()
        self.wfile.write(b"archive")

    def log_message(self, _format: str, *_args: object) -> None:
        """確認結果だけを出力するためHTTPのアクセス記録を省く。"""


root = Path(__file__).resolve().parents[4]
source = (root / "Docker/voicevox/Dockerfile").read_text()
# 展開処理は実イメージのビルドで確認し、ここでは取得・確定の実装そのものを使う。
script = source[source.index("    set -eu;") : source.index("    cd /opt;")]
script = script.replace("\\\n", " ").replace("${VOICEVOX_VERSION}", "0.25.2")
server = HTTPServer(("127.0.0.1", 0), Handler)
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    with tempfile.TemporaryDirectory() as directory:
        script = script.replace("/mnt/", directory + "/")
        url = "https://github.com/VOICEVOX/voicevox_engine/releases/download/0.25.2/voicevox_engine-linux-cpu-x64-0.25.2.7z.001"
        script = script.replace(url, f"http://127.0.0.1:{server.server_port}/archive")
        archive = Path(directory) / "voicevox_engine-linux-cpu-x64-0.25.2.7z"
        result = subprocess.run(["sh", "-c", script], capture_output=True, check=False)
        assert result.returncode != 0, "HTTPエラーを成功扱いした"
        assert not archive.exists()
        assert not Path(str(archive) + ".tmp").exists()
        subprocess.run(["sh", "-c", script], check=True, capture_output=True)
        assert archive.read_bytes() == b"archive"
        subprocess.run(["sh", "-c", script], check=True, capture_output=True)
        assert Handler.calls == 2, "正常キャッシュを再取得した"
finally:
    server.shutdown()
    server.server_close()
    thread.join()
# reason: 単発の検証用スクリプトの結果を標準出力へ表示する。
print("HTTP失敗時のキャッシュ除去・再試行・再利用: PASS")
