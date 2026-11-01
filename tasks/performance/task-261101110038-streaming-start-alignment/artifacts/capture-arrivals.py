"""実Engineと本番HTTP読取りのPCM到着列を、Go再生時計の比較用に保存する。"""

import argparse
import base64
import json
from pathlib import Path
from threading import Event
from time import perf_counter

from voice_synthesizer.VoiceSynthesizer.VoiceVox import VoiceVox
from voice_synthesizer.wav_stream import iter_pcm

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--port", type=int, default=15022)
parser.add_argument("--segment", type=float, default=0.43)
args = parser.parse_args()
client = VoiceVox(port=args.port)
try:
    query = client.audio_query(
        "今日は天気がよいので、公園を歩きながら、ゆっくりとお話ししましょう。", 0
    )
    query.outputSamplingRate = 48000
    query.outputStereo = False
    post = client.session.post

    def select_segment(*positional, **keyword):
        # 旧値との比較だけに使い、本番HTTP読取りとWAV検証はそのまま通す。
        keyword["params"]["segment_length"] = args.segment
        return post(*positional, **keyword)

    client.session.post = select_segment
    started = perf_counter()
    chunks = []
    source = client.query_synthesis_stream(query, 0, Event())
    try:
        for pcm in iter_pcm(source):
            chunks.append(
                {
                    "at_ms": (perf_counter() - started) * 1000,
                    "pcm": base64.b64encode(pcm).decode(),
                }
            )
    finally:
        source.close()
    args.output.write_text(json.dumps({"segment": args.segment, "chunks": chunks}))
finally:
    client.close()
