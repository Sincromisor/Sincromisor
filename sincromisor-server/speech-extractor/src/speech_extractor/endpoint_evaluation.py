"""注釈付きの同一WAVから旧方式と新方式を比較する、録音内容を出力しない評価CLI。"""

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path

import numpy as np

from .endpoint_models import EndpointModels
from .evaluation_annotations import EvaluationAnnotations, load_audio
from .evaluation_metrics import EvaluationRun, summarize
from .evaluation_runners import run_legacy, run_smart
from .model_assets import DEFAULT_MODEL_DIR, MODELS


def _yamnet(pcm: np.ndarray, model: Path, silence_ms: int) -> EvaluationRun:
    """評価用のMediaPipeだけを遅延ロードし、基点と同じ最上位Speechスコアを使う。"""
    from mediapipe.tasks import python
    from mediapipe.tasks.python import audio
    from mediapipe.tasks.python.components import containers

    options = audio.AudioClassifierOptions(
        base_options=python.BaseOptions(model_asset_path=str(model)), max_results=1
    )
    with audio.AudioClassifier.create_from_options(options) as classifier:

        def classify(frame: np.ndarray) -> bool:
            clip = containers.AudioData.create_from_array(
                frame.astype(float) / 32767, 16000
            )
            categories = classifier.classify(clip)[0].classifications[0].categories
            return any(
                category.category_name == "Speech"
                and category.score is not None
                and category.score > 0.6
                for category in categories
            )

        return run_legacy(pcm, classify, silence_ms)


@dataclass(frozen=True)
class EvaluationConfig:
    """比較対象のモデル配置と、両方式に共通の無音閾値を保持する。"""

    models_path: Path = DEFAULT_MODEL_DIR
    yamnet_path: Path = Path("assets/3rd_party/yamnet.tflite")
    silence_ms: int = 1000


def compare(
    audio_path: Path, annotations_path: Path, config: EvaluationConfig
) -> dict[str, object]:
    """先に注釈を検証し、入力ハッシュとモデル版を付けて両方式を同じ条件で比較する。"""
    pcm, digest = load_audio(audio_path)
    annotation_bytes = annotations_path.read_bytes()
    annotations = EvaluationAnnotations.model_validate_json(annotation_bytes)
    annotations.validate_audio(pcm.size, digest)
    models = EndpointModels(config.models_path)
    legacy = _yamnet(pcm, config.yamnet_path, config.silence_ms)
    smart = run_smart(pcm, models, config.silence_ms)
    return {
        "schema_version": 1,
        "runtime_versions": {
            name: version(name) for name in ("numpy", "onnxruntime", "mediapipe")
        },
        "recording_id": annotations.recording_id,
        "audio_sha256": digest,
        "annotations_sha256": hashlib.sha256(annotation_bytes).hexdigest(),
        "input_samples": pcm.size,
        "sample_rate": 16000,
        "added_silence_samples": 0,
        "max_silence_ms": config.silence_ms,
        "execution": "sequential_without_transport_or_queue_wait",
        "model_sha256": {
            "yamnet": hashlib.sha256(config.yamnet_path.read_bytes()).hexdigest(),
            **{name: digest for name, (_, digest) in MODELS.items()},
        },
        "legacy": summarize(legacy, annotations),
        "smart_turn": summarize(smart, annotations),
    }


def main() -> None:
    """保存先の指定時だけ集計JSONを書き込む。原音声・認識文・ファイルパスは集計に含めない。"""
    parser = argparse.ArgumentParser(description="発話終端の注釈付き実音声比較")
    parser.add_argument("audio", type=Path)
    parser.add_argument("annotations", type=Path)
    parser.add_argument("--models", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument(
        "--yamnet", type=Path, default=Path("assets/3rd_party/yamnet.tflite")
    )
    parser.add_argument("--max-silence-ms", type=int, choices=(600, 1000), default=1000)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = compare(
        args.audio,
        args.annotations,
        EvaluationConfig(args.models, args.yamnet, args.max_silence_ms),
    )
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output is None:
        sys.stdout.write(encoded)
    else:
        args.output.write_text(encoded)


if __name__ == "__main__":
    main()
