"""管理下のVOICEVOXからRTC再生素材を作る。再生時にはPythonや合成サービスを使わない。

実際に合成したクエリと既存VoiceSynthesizerのモーラ抽出結果をそのまま保存する。
出力先は新規ディレクトリに限定し、生成失敗で既存の音声とJSONを混在させない。
"""

import argparse
import logging
import subprocess
from pathlib import Path

from sincro_models import VoiceSynthesizerRequest
from voice_synthesizer.VoiceSynthesizer.VoiceSynthesizer import VoiceSynthesizer

logger = logging.getLogger(__name__)


def main() -> None:
    """合成・Opus変換が成功してから新規ディレクトリへ音声とJSONを書き出す。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=50021)
    parser.add_argument("--style-id", type=int, default=3)
    parser.add_argument("--text", default="こんにちは。音声と、口の動きを確認します。")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output directory must not exist")

    # 無音長・速度は既存の生成処理の既定値を使う。クエリの加工後に合成されるため、
    # 保存したモーラ時刻が加工前のクエリに由来することはない。
    result = VoiceSynthesizer(args.host, args.port).generate(
        VoiceSynthesizerRequest(
            speech_id=0,
            message=args.text,
            style_id=args.style_id,
            audio_format="audio/wav",
        )
    )
    encoded = encode_opus(args.ffmpeg, result.voice)
    result.audio_format = "audio/ogg;codecs=opus"
    metadata = result.model_dump_json(exclude={"voice", "speech_id"}, indent=2)
    args.output.mkdir(parents=True)
    (args.output / "voice.opus").write_bytes(encoded)
    (args.output / "synthesis.json").write_text(metadata + "\n", encoding="utf-8")
    logger.info("playback sample exported: seconds=%.3f", result.speaking_time)


def encode_opus(ffmpeg: str, wav: bytes) -> bytes:
    """WAVの長さを保ってOgg Opusへ変換する。失敗・30秒の時間切れは呼び出し元へ伝播する。"""
    return subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "libopus",
            "-b:a",
            "64k",
            "-f",
            "ogg",
            "pipe:1",
        ],
        input=wav,
        capture_output=True,
        check=True,
        timeout=30,
    ).stdout


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
