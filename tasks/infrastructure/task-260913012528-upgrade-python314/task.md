# Python実行環境を3.14へ切り替える

## 背景 / 目的

[依存更新タスク](../task-260913012528-prepare-python314-dependencies/task.md)で移行前提を満たした後、現行サービスと開発環境のPythonを3.12から3.14へ更新する。

## 完了条件（受け入れ条件）

- [x] ルートと現行ワークスペースのPython指定を`>=3.14,<3.15`と`.python-version`の3.14へ揃え、ロックを再生成する。
- [x] Python 3.14でロックした依存の導入、既存Pythonテスト、YAMNetの音声分類、NeMo / ReazonSpeechの読み込みが通る。
- [x] 開発環境の案内・コメントとPython規約を同期し、コンテナが共通のPython指定を使うことを確認する。

## スコープ境界

現行ワークスペース、uv.lock、開発環境セットアップ、関連文書を対象とする。廃止済みNue-ASRの再対応や稼働中コンテナの本番切り替えは含めない。

## 実装方針

既存のuvとルート`.python-version`を利用する。新しいバージョン切り替え機構は作らない。Python 3.14固有の実行時問題が再現した場合は影響箇所だけ修正する。対象バージョンの変更で新たに発生するRuffの型注釈・整形指摘は同時に解消する。

## テスト

`uv sync --locked --group dev --group full`、現行サービスの既存pytest、主要ライブラリのimportとYAMNetの無音分類を実行する。Ruff・tyによる対象確認を行い、既存由来の対象外不整合と区別する。

## ドキュメント同期の要否

`utils/setup-devenv/README.md`、同`setup.sh`のコメント、`documents/rules/coding-py.md`を同期する。コンテナはルートのPython指定をコピーする既存方式を維持する。

## 実施結果

- CPython 3.14.7で`uv sync --locked --group dev --group full`が成功した。削除された標準音声モジュールを補う推移依存4件がロックへ追加された。
- 現行サービスのPython指定を同期した。Dockerfileはルートの`.python-version`とロックをコピーして`uv sync --locked`するため、同じ3.14を利用する。
- 既存テスト28件が成功した。Go生成MessagePackの復号、辞書・候補処理、Difyストリームの切断・取消を含む。
- YAMNetの無音分類は`Silence`、NumPyとTorchの配列往復も成功した。RTX 5060 Ti上で`SpeechRecognizerNemo`のモデル読み込みと1秒の合成無音の推論が完了し、本文`。`が返った。認識精度の評価には使っていない。
- `ty check .`は成功した。Ruffは移行による25件（UP037 / UP043）を修正し、整形65ファイルが成功した。型注釈と例外構文のみを更新し、変更したメソッドの説明不足を補った。
- Ruffに残る96件は`--target-version py312`でも同じ規則・件数で検出された既存不整合。追加の無関係な修正は行っていない。
- セットアップのシェル構文、変更文書の整形、タスク状態・索引を確認した。コメント点検: PASS。

### 実行確認の再現

リポジトリルートで`uv run --no-sync pytest sincromisor-server/sincro-models/tests sincromisor-server/text-processor/tests sincromisor-server/speech-recognizer-nemo/tests -q`を実行する。
音声デバイスとGPUへアクセスできる環境で、次の実モデル確認を実行した。

```sh
uv run --no-sync python - <<'PY'
import numpy as np
import torch
from mediapipe.tasks import python
from mediapipe.tasks.python import audio, components
from speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemo import SpeechRecognizerNemo

wave = np.zeros(16000, dtype=np.float32)
assert np.array_equal(torch.from_numpy(wave).numpy(), wave)
options = audio.AudioClassifierOptions(
    base_options=python.BaseOptions(model_asset_path="sincromisor-server/assets/3rd_party/yamnet.tflite"),
    max_results=1,
)
with audio.AudioClassifier.create_from_options(options) as classifier:
    result = classifier.classify(components.containers.AudioData.create_from_array(wave, 16000))
    assert result and result[0].classifications[0].categories
    print(result[0].classifications[0].categories[0].category_name)
assert torch.cuda.is_available()
recognizer = SpeechRecognizerNemo()
print(recognizer.transcribe(wave).text)
PY
```

### 未実行事項・残る問題

Dockerイメージの再ビルドと稼働サービスの切り替え、ブラウザーを含む会話全体、実音声による精度評価は未実行。廃止済みNue-ASRは旧指定を保持し、現行サービスの確認対象に含めない。既存のRuff指摘と依存内SWIGの非推奨警告が残る。
