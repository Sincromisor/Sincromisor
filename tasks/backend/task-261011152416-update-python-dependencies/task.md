# Python依存を更新しMediaPipeの厳密固定を解除する

## 背景 / 目的

音声処理サービスと共通モデルの依存更新を取り込み、ユーザーの指定に基づきバックエンドのMediaPipeの厳密固定を解除する。

調査基準日は2026-10-11。以下は公式レジストリとロックファイルを比較した更新候補であり、動作確認済みの採用版ではない。実装開始時に公開状況と依存条件を再確認し、互換性を満たす安定版を採用する。更新を見送る候補は具体的な制約と理由を記録する。

| 依存               | 調査時の採用版  | 更新候補        |
| ------------------ | --------------- | --------------- |
| `aiohttp`          | 3.14.3          | 3.14.5          |
| `boto3`            | 1.43.93         | 1.43.111        |
| `fastapi`          | 0.141.1         | 0.143.0         |
| `httpx2`           | 2.12.0          | 2.13.1          |
| `idna`             | 3.19            | 3.20            |
| `mediapipe`        | 1.0.1           | 1.1.0           |
| `msgpack`          | 1.2.2           | 1.2.3           |
| `multidict`        | 6.9.1           | 7.1.0           |
| `numpy`            | 2.5.3           | 2.5.4           |
| `onnx`             | 1.22.0          | 1.23.2          |
| `pyarrow`          | 25.0.1          | 26.0.0          |
| `pydantic`         | 2.13.5          | 2.14.0          |
| `python-dotenv`    | 1.2.3           | 1.2.4           |
| `ruff`             | 0.16.7          | 0.17.0          |
| `setproctitle`     | 1.3.7           | 1.3.8           |
| `starlette`        | 1.6.0           | 1.7.0           |
| `sudachidict-full` | 20260723        | 20260723.1      |
| `sudachipy`        | 0.6.11          | 0.7.0           |
| `ty`               | 0.0.80          | 0.0.86          |
| `types-requests`   | 2.33.0.20260906 | 2.33.0.20261006 |
| `uvicorn`          | 0.52.4          | 0.54.0          |
| `websockets`       | 17.1            | 17.2            |

表には直接依存、開発依存、およびルートで明示的に制約を置いている推移依存を含む。PyPIの各`https://pypi.org/pypi/<パッケージ名>/json`を調査元とした。

## 完了条件（受け入れ条件）

- [ ] 候補を[ルートの依存定義](../../../pyproject.toml)、各サービスの`pyproject.toml`、[uv.lock](../../../uv.lock)へ整合する形で反映し、各サービスの依存を`--locked`で導入できる。
- [x] [SpeechExtractorの依存定義](../../../sincromisor-server/speech-extractor/pyproject.toml)の`mediapipe==1.0.1`を、採用版を下限とする範囲指定へ変更する。1.1.0採用時は`mediapipe>=1.1.0`を基本とし、上限は具体的な非互換根拠がある場合だけ設ける。実際の採用版は`uv.lock`で固定する。
- [ ] SpeechExtractorの実際のAudioClassifierが起動し、既存の音声素材を処理できる。Python 3.14と既存Linuxコンテナで必要な配布物・ネイティブ依存が揃う。
- [ ] 共通モデルのシリアライズ、音声認識の後処理、Mastraストリームの変換、音声合成の既存確認が通り、通信契約を維持する。
- [x] 更新した直接・推移依存の採用版、解決上の制約、見送った候補を記録する。

## 設計判断と変更範囲

Python 3.14系とuv workspaceを維持する。MediaPipeの上限・下限とロックによる再現性を区別し、厳密固定解除をロック廃止や起動時の自動更新に置き換えない。

`sincro-config`、`sincro-models`、`speech-extractor`、`speech-recognizer-nemo`、`text-processor`、`voice-synthesizer`を対象とする。HTTP系とFastAPI・Starlette・Pydanticは依存条件を合わせて更新する。`multidict`と`pyarrow`のメジャー更新は親依存との解決と利用箇所の互換性を確認する。

推移依存は親パッケージの制約内で更新する。Torch 2.14.0→2.14.1、Transformers 5.17.0→5.19.0なども候補として確認するが、NeMo・CUDAの制約を上書きして最新版へ強制しない。NeMo 3.0.0とReazonSpeechの固定コミットは調査時点で最新と一致しており、理由のない切替は行わない。

Dockerfileの変更は今回の依存導入に必要な互換修正に限定する。GPU基盤・OSの一括更新、LLM・音声モデルの変更、外部サービスAPIの追加、通信契約変更は対象外。

## 確認方法

1. `uv lock --check`と各サービスグループの`uv sync --locked --group <グループ名>`を対応環境で確認する。NeMoは既存のCUDAコンテナを用い、ホストへGPU依存の導入を強制しない。
2. `uv run --group dev --group full ty check .`と変更したPythonのRuff検査を実施する。既存の`sincro-config/tests`、`sincro-models/tests`、`speech-recognizer-nemo/tests`、`text-processor/tests`、`voice-synthesizer/tests`を依存導入済み環境で実行する。
3. SpeechExtractorは[SpeechExtractorWorker](../../../sincromisor-server/speech-extractor/src/speech_extractor/SpeechExtractor/SpeechExtractorWorker.py)が使う実際のモデルとAudioClassifierで小さな音声素材を処理する。モックだけでMediaPipe更新を合格にしない。
4. 更新した推論系依存は既存の認識経路で音声一件を処理して確認する。環境不足で未実行なら理由と未確認範囲を記録し、確認済みと扱わない。

## 文書同期

[SpeechExtractor設計](../../../documents/design/backend/services/speech-extractor.md)と各サービスのREADMEのうち、採用版・導入条件が変わる箇所を同期する。[音声パイプライン契約](../../../documents/design/contracts/audio-pipeline-websocket.md)は変更しない。

## 実装・確認結果

候補表の全版とTorch 2.14.1、Transformers 5.19.0を採用した。追従した推移依存はbotocore 1.43.111、httpcore2 2.13.1、pydantic-core 2.50.0、yarl 1.25.1。NeMo 3.0.0とReazonSpeechの固定コミットは維持した。MediaPipeは`>=1.1.0`へ変更し、上限は追加していない。

`uv lock --check`、GPU不要の3サービスと開発グループの`uv sync --locked`、Ruff、導入済み5パッケージのty、共通設定・モデル・Mastraストリーム変換・音声合成の59テストが成功した。実SpeechExtractorWorkerのYAMNet AudioClassifierが既存Gate3音声を処理し、5分類結果を返した。Linux x86_64向け`uv sync --locked --group dev --group full --python-platform x86_64-unknown-linux-gnu --dry-run`も成功した。

CUDA対応LinuxコンテナでのNeMo導入・実音声認識と全体型検査は未確認のため、タスクは完了にしていない。[実装記録](impl.md)に再開条件を残す。
