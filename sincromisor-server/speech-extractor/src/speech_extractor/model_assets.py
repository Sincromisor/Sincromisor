"""固定版の発話モデルを事前取得する。実行サービスは検証済みファイルだけを読む。"""

import argparse
import hashlib
import logging
import urllib.request
from pathlib import Path

# 上流コミットとSHA-256を同時固定し、更新時は前処理と品質を再評価する。
MODELS = {
    "silero-v6.2.onnx": (
        "https://raw.githubusercontent.com/snakers4/silero-vad/be95df9152c0d7618fa1edfeb296fc3dae32376f/src/silero_vad/data/silero_vad.onnx",
        "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3",
    ),
    "smart-turn-v3.2-cpu.onnx": (
        "https://huggingface.co/pipecat-ai/smart-turn-v3/resolve/f766f81d3cfdf7737ac64aad813d91bbfd56bf93/smart-turn-v3.2-cpu.onnx",
        "2bb026316b14a660486a75b1733cd3fbab8c2fd0314dc9af7be49f8cca967e4f",
    ),
}
DEFAULT_MODEL_DIR = Path("assets/3rd_party/turn")


def verified_model(directory: Path, name: str) -> Path:
    """欠落・別版・破損を起動前に拒否する。ここでは通信しない。"""
    path = directory / name
    if hashlib.sha256(path.read_bytes()).hexdigest() != MODELS[name][1]:
        raise ValueError(f"Model checksum mismatch: {name}")
    return path


def prepare_models(directory: Path) -> None:
    """ビルドまたは明示的な準備コマンドからだけ呼び、検証後に原子的に配置する。"""
    directory.mkdir(parents=True, exist_ok=True)
    for name, (url, digest) in MODELS.items():
        target = directory / name
        if target.exists():
            verified_model(directory, name)
            continue
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(40 * 1024 * 1024 + 1)
        if len(data) > 40 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Downloaded model checksum mismatch: {name}")
        temporary = target.with_suffix(".download")
        try:
            temporary.write_bytes(data)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        logging.getLogger(__name__).info("Model prepared: %s", name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="発話モデルの固定版を事前取得する")
    parser.add_argument("directory", type=Path, nargs="?", default=DEFAULT_MODEL_DIR)
    prepare_models(parser.parse_args().directory)
