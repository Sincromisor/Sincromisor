"""固定本文を40ms/文字のSSE到着として再生し、本番合成のPCM・モーラ・間を比較する。"""

import argparse
import base64
import json
import re
import struct
import wave
from pathlib import Path
from threading import Event
from time import perf_counter, sleep

import text_processor.speech_phrases as phrases_module
from sincro_models import VoiceSynthesizerRequest
from text_processor.speech_phrases import SpeechPhrases
from voice_synthesizer.streaming_mora_timing import build_streaming_mora_queue
from voice_synthesizer.VoiceSynthesizer.VoiceSynthesizer import VoiceSynthesizer

TEXTS = {
    "short": "はい、今日は、晴れなので、公園で、ゆっくり、散歩しましょう。",
    "sparse": "今日は天気がよいので公園を歩きながらゆっくりとお話ししましょう。",
    "decimal": "値は3.14で、1,234.5円です。",
}
INTERVAL = 0.04


def fragments(text, variant):
    """旧句読点分割と候補を同じ文字到着列へ適用する。最終残片は正常終端だけで出す。"""
    phrases_module.MIN_FOLLOWING_PHRASE_LENGTH = 8 if variant == "min8" else 12
    phrases, pending, output = SpeechPhrases(), "", []
    for i, char in enumerate(text):
        at = (i + 1) * INTERVAL
        if variant in ("legacy", "padding"):
            *ready, pending = re.split(r"(?<=[、。？！,.?!])", pending + char)
        else:
            ready = list(phrases.feed(char))
            pending = phrases.pending
        output.extend((part, at) for part in ready if part)
    if pending:
        output.append((pending, (len(text) + 1) * INTERVAL))
    assert "".join(part for part, _ in output) == text
    return output


def capture(client, output, name, variant):
    """壁時計の到着列と連結WAVを保存する。閾値500の有音位置は聴取の代わりにしない。"""
    started = perf_counter()
    arrivals, reports, whole, voiced = [], [], bytearray(), []
    for index, (text, released) in enumerate(fragments(TEXTS[name], variant)):
        sleep(max(0, started + released - perf_counter()))
        request = VoiceSynthesizerRequest(
            speech_id=1,
            message=text,
            style_id=0,
            pre_phoneme_length=0.1 if index == 0 or variant == "legacy" else 0,
            post_phoneme_length=0.1,
        )
        pcm = bytearray()
        first_delivery = None
        for query, part in client.generate_pcm(request, Event(), {}):
            at = (perf_counter() - started) * 1000
            arrivals.append(
                {
                    "at_ms": at,
                    "request_id": index + 1,
                    "final": False,
                    "pcm": base64.b64encode(part).decode(),
                }
            )
            samples = struct.unpack(f"<{len(part) // 2}h", part)
            if first_delivery is None and any(abs(s) > 500 for s in samples):
                first_delivery = at
            pcm.extend(part)
        arrivals.append(
            {
                "at_ms": (perf_counter() - started) * 1000,
                "request_id": index + 1,
                "final": True,
                "pcm": "",
            }
        )
        moras = build_streaming_mora_queue(query)
        sample_count = len(pcm) // 2
        assert round(sum(m.length for m in moras) * 48000) == sample_count
        samples = struct.unpack(f"<{sample_count}h", pcm)
        active = [i for i, s in enumerate(samples) if abs(s) > 500]
        assert active
        start, end = len(whole) // 2 + active[0], len(whole) // 2 + active[-1]
        voiced.append((start, end))
        reports.append(
            {
                "text": text,
                "released_ms": released * 1000,
                "first_voiced_chunk_received_ms": first_delivery,
                "pre": request.pre_phoneme_length,
                "post": request.post_phoneme_length,
                "samples": sample_count,
                "mora_samples": round(sum(m.length for m in moras) * 48000),
                "kana": query.kana,
                "mora_starts": [
                    round(sum(m.length for m in moras[:i]) * 48000)
                    for i in range(len(moras))
                ],
            }
        )
        whole.extend(pcm)
    stem = f"{name}-{variant}"
    with wave.open(str(output / f"{stem}.wav"), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(48000)
        wav.writeframes(whole)
    (output / f"{stem}-arrivals.json").write_text(
        json.dumps({"segment": 0.43, "chunks": arrivals})
    )
    return {
        "case": name,
        "variant": variant,
        "fragments": reports,
        "boundary_silence_ms": [
            round((voiced[i][0] - voiced[i - 1][1] - 1) / 48, 2)
            for i in range(1, len(voiced))
        ],
        "duration_ms": len(whole) / 96,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--port", type=int, default=15022)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    client = VoiceSynthesizer(port=args.port)
    try:
        # モデルの初回ロードを比較から除外し、順序は記録どおり固定する。
        list(
            client.generate_pcm(
                VoiceSynthesizerRequest(speech_id=0, message="準備です。", style_id=0),
                Event(),
                {},
            )
        )
        reports = []
        for name, variants in [
            ("short", ["legacy", "padding", "min8", "min12"]),
            ("sparse", ["legacy", "min12"]),
            ("decimal", ["legacy", "min12"]),
        ]:
            for variant in variants:
                report = capture(client, args.output, name, variant)
                reports.append(report)
                print(
                    json.dumps(
                        {
                            "case": name,
                            "variant": variant,
                            "parts": len(report["fragments"]),
                            "gaps_ms": report["boundary_silence_ms"],
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
        (args.output / "measurements.json").write_text(
            json.dumps(reports, ensure_ascii=False, indent=2) + "\n"
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()
