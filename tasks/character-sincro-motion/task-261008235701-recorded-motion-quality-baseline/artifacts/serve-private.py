"""既存原本の読込と新しい非公開JSON結果の保存だけを行うローカル確認用サーバー。"""
import argparse
import http.server
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("kind", choices=["source", "generated"])
args = parser.parse_args()
root = Path.cwd()
output = root / "work/private-artifacts/task-261008235701-recorded-motion-quality-baseline"
source = root / "work/private-artifacts.macbook/task-260705214026-canonical-temporal-arm-solver-production" if args.kind == "source" else output
output.mkdir(parents=True, exist_ok=True)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(source), **kw)

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin in ["http://127.0.0.1:5173", "http://127.0.0.1:5174"]:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        name = self.path.removeprefix("/")
        if not name.endswith(".json") or "/" in name or ".." in name:
            self.send_error(400)
            return
        value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        (output / name).write_text(json.dumps(value))
        self.send_response(200)
        self.end_headers()

http.server.ThreadingHTTPServer(("127.0.0.1", 8877 if args.kind == "source" else 8878), Handler).serve_forever()
