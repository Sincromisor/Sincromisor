# TASK-4000 uv audit remediation

## 背景

`uv audit` で Python 依存パッケージの既知脆弱性を確認し、可能な範囲で安全なバージョンへ更新する。

## 作業内容

- `uv audit` の指摘内容を確認する。
- 影響がある依存パッケージを更新する。
- LLM / ASR 関連依存の更新は破壊的変更の可能性を確認して進める。
- 更新後に `uv audit` と必要な静的チェックを実行する。

## 調査結果

- `aiohttp`, `cryptography`, `gitpython`, `mako`, `onnx`, `pillow`, `pygments`, `pyopenssl`, `python-dotenv`, `requests`, `werkzeug` は修正済みバージョンへ更新する。
- `numpy==1.26.4` は `mediapipe` と NumPy 2 系の過去不具合対策として残っている可能性が高い。`mediapipe 0.10.32` のメタデータに NumPy 2 系を拒否する制約はないが、ASR/音声処理全体の挙動影響が大きいため今回の audit 修正では維持する。
- `transformers` は `nemo-toolkit[asr]` 経由の推移依存。修正済みバージョンは `5.0.0rc3` 以上だが、`nemo-toolkit[asr]` は `transformers<4.54` または `transformers<4.58` を要求するため同時解決できない。
- 本リポジトリの実装は脆弱性対象の `Trainer` を直接利用していない。ASR/LLM の挙動影響を避けるため、`transformers` は upstream の対応待ちとして残存リスクを明示する。

## 完了条件

- 修正可能な audit 指摘が解消している。
- 残存する指摘がある場合は理由と影響範囲を記録している。
- 関連差分がコミットされている。

## 確認結果

- `uv audit --locked`: `transformers 4.53.3` / `GHSA-69w3-r845-3855` の 1 件のみ残存。
- `uv audit --locked --ignore GHSA-69w3-r845-3855`: 既知脆弱性なし。
- `uv run ruff check .`: 既存の `UP042` と `I001` 指摘で失敗。依存更新とは別の既存コード整形指摘として扱う。
