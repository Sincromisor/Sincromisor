"""コンテナ内から実EngineのWAV完全性と先頭PCM到着を確認する。音声は保存しない。"""

import io
import json
import time
import urllib.parse
import urllib.request
import wave

BASE = "http://127.0.0.1:50021"
TEXT = "音声合成の結合確認です。最初の区間を受信した後も、続きの音声が順番に届くことを確認します。"


def request(path: str, data: bytes | None = None) -> object:
    """EngineのJSON APIを呼び、HTTP失敗は検証失敗として伝える。"""
    with urllib.request.urlopen(BASE + path, data=data, timeout=30) as response:
        return json.load(response)


styles = {
    style["id"] for speaker in request("/speakers") for style in speaker["styles"]
}
assert 0 in styles
query = request(
    "/audio_query?" + urllib.parse.urlencode({"speaker": 0, "text": TEXT}), b""
)
results = []
for mode, path in (
    ("normal", "/synthesis?speaker=0"),
    ("fixed", "/streaming_synthesis?speaker=0&segment_length=0.3"),
    (
        "ramped",
        "/streaming_synthesis?speaker=0&segment_length=0.3&max_segment_length=2.4",
    ),
):
    started = time.perf_counter()
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(query).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        data = response.read(4096)  # WAVヘッダーより大きく、PCMの到着まで待つ。
        first_pcm = time.perf_counter() - started
        data += response.read()
        total = time.perf_counter() - started
        assert len(data) == int(response.headers["Content-Length"])
    with wave.open(io.BytesIO(data)) as wav:
        frames = wav.getnframes()
        assert (
            len(wav.readframes(frames))
            == frames * wav.getnchannels() * wav.getsampwidth()
        )
        shape = (frames, wav.getframerate(), wav.getnchannels(), wav.getsampwidth())
    if mode == "normal":
        normal_shape = shape
    else:
        assert shape == normal_shape
        assert first_pcm < total
    results.append(
        {
            "mode": mode,
            "first_pcm_s": first_pcm,
            "total_s": total,
            "bytes": len(data),
            "wave": shape,
        }
    )
print(
    json.dumps(
        {"styles": sorted(styles), "checks": results}, ensure_ascii=False, indent=2
    )
)
