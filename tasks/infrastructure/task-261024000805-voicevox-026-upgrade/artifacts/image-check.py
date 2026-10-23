"""実イメージの版、ライセンス、非root実行とConsulの正常登録を検証する。"""

import ctypes
import json
import os
import urllib.request
from pathlib import Path

revision = Path("ENGINE_REVISION").read_text().strip()
patch = Path("STREAMING_PATCH_SHA256").read_text().strip()
assert revision == "7ebc23342bd812f5a72816330f62f110ccca8bdc"
assert patch == "3dfbff49ffd8451cfe955b30dc64e62f21ac8142321b00a94c2115f000c5aa7a"
manifest = json.loads(Path("engine_manifest.json").read_text())
assert manifest["version"] == f"0.26.0+sincromisor.{revision}.{patch[:12]}"
core = ctypes.CDLL("/opt/voicevox/libvoicevox_core.so")
core.voicevox_get_version.restype = ctypes.c_char_p
assert core.voicevox_get_version() == b"0.17.1"
assert os.getuid() == 10001
licenses = json.loads(
    Path("resources/engine_manifest_assets/dependency_licenses.json").read_text()
)
assert all(item["text"] for item in licenses)
with urllib.request.urlopen(
    "http://consul-agent-synthesizer:8500/v1/health/service/SincroVoiceVox?passing=true",
    timeout=5,
) as response:
    assert len(json.load(response)) == 1
print(
    json.dumps(
        {
            "engine": manifest["version"],
            "core_library": "0.17.1",
            "uid": os.getuid(),
            "licenses": len(licenses),
            "consul": "passing",
        },
        indent=2,
    )
)
