"""固定ビルドに含む配布物からライセンス一覧を作り、Engineのダミー一覧を置き換える。"""

import json
import sys
import sysconfig
from importlib.metadata import distributions
from pathlib import Path


def dependency_licenses() -> list[dict[str, str | None]]:
    """導入済みwheelの本文・同梱通知を列挙し、本文を持たない依存があればビルドを止める。"""
    licenses = []
    for distribution in sorted(distributions(), key=lambda item: item.metadata["Name"]):
        files = [
            file
            for file in distribution.files or []
            if any(
                name in file.name.lower()
                for name in ("license", "licence", "copying", "notice")
            )
        ]
        if not files:
            raise ValueError(f"Missing license text: {distribution.metadata['Name']}")
        licenses.append(
            {
                "name": distribution.metadata["Name"],
                "version": distribution.version,
                "license": distribution.metadata.get("License-Expression")
                or distribution.metadata.get("License"),
                "text": "\n\n".join(file.read_text(encoding="utf-8") for file in files),
            }
        )
    return licenses


def main() -> None:
    """Python外の同梱情報も加え、追加のネットワーク取得なしでEngineの形式へ保存する。"""
    licenses = dependency_licenses()
    for name, version, pattern in (
        (
            "Python",
            sys.version.split()[0],
            str(Path(sysconfig.get_path("stdlib")) / "LICENSE.txt"),
        ),
        (
            "VOICEVOX ENGINE",
            Path("ENGINE_REVISION").read_text().strip(),
            "LGPL_LICENSE",
        ),
        ("VOICEVOX CORE", "0.17.0", "/opt/voicevox/licenses/core/**/LICENSE"),
        ("VOICEVOX ONNX Runtime", "1.23.2", "/opt/voicevox/onnxruntime/TERMS.txt"),
        (
            "VOICEVOX ONNX Runtime notices",
            "1.23.2",
            "/opt/voicevox/onnxruntime/third-party-notices.html",
        ),
        (
            "Open JTalk / MeCab / NAIST dictionary",
            None,
            "tools/licenses/open_jtalk/**/COPYING",
        ),
    ):
        path = Path(pattern)
        root = Path(path.anchor) if path.is_absolute() else Path()
        files = sorted(root.glob(str(path.relative_to(root))))
        if not files:
            raise ValueError(f"Missing bundled license: {name}")
        licenses.append(
            {
                "name": name,
                "version": version,
                "license": None,
                "text": "\n\n".join(file.read_text() for file in files),
            }
        )
    Path("resources/engine_manifest_assets/dependency_licenses.json").write_text(
        json.dumps(licenses, ensure_ascii=False, indent=2)
    )


if __name__ == "__main__":
    main()
