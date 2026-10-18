"""EngineのPCM WAVを任意のHTTP読取境界から検証し、最大100msずつ返す。"""

import struct
from collections.abc import Iterable, Iterator

# 会話側の120秒上限と揃え、完全音声を保存するバッファも約11.5MBに制限する。
MAX_PCM_BYTES = 48_000 * 2 * 120
PCM_CHUNK_BYTES = 4_800 * 2


def _pcm_length(header: bytes) -> int:
    """Engineの44byte PCMヘッダーのみ受理し、宣言長と48kHz mono s16leを検証する。"""
    (
        riff,
        size,
        wave,
        fmt,
        fmt_size,
        codec,
        channels,
        rate,
        byte_rate,
        align,
        bits,
        data,
        length,
    ) = struct.unpack("<4sI4s4sIHHIIHH4sI", header)
    if (
        riff,
        wave,
        fmt,
        fmt_size,
        codec,
        channels,
        rate,
        byte_rate,
        align,
        bits,
        data,
    ) != (b"RIFF", b"WAVE", b"fmt ", 16, 1, 1, 48_000, 96_000, 2, 16, b"data"):
        raise ValueError("Unsupported streaming WAV format")
    if not 0 < length <= MAX_PCM_BYTES or length % 2 or size != length + 36:
        raise ValueError("Invalid streaming WAV length")
    return length


def iter_pcm(parts: Iterable[bytes]) -> Iterator[bytes]:
    """全体を待たずPCMを返す。EOF時の欠損・余剰は完了扱いせず例外にする。"""
    header = bytearray()
    pending = bytearray()
    expected: int | None = None
    received = 0
    for raw in parts:
        part = raw
        if expected is None:
            needed = 44 - len(header)
            header.extend(part[:needed])
            part = part[needed:]
            if len(header) < 44:
                continue
            expected = _pcm_length(bytes(header))
        received += len(part)
        if received > expected:
            raise ValueError("Streaming WAV contains trailing bytes")
        pending.extend(part)
        while len(pending) >= PCM_CHUNK_BYTES:
            yield bytes(pending[:PCM_CHUNK_BYTES])
            del pending[:PCM_CHUNK_BYTES]
    if expected is None or received != expected:
        raise ValueError("Truncated streaming WAV")
    if pending:
        yield bytes(pending)
