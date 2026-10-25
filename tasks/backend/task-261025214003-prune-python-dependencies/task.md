# Python依存の未使用宣言と本番への不要導入を整理する

## 背景 / 目的

リポジトリ全体の依存棚卸しで挙げた1〜6について、ユーザーから起票と実行を依頼された。
未使用の開発依存、本番で使わない依存、利用責務と一致しない重複宣言を整理する。
調査時点のHEADは `af7373df`。既存の動作、確認スクリプト、バージョン下限を維持する。

## 完了条件（受け入れ条件）

- [x] 1: ルートの `types-psutil` を削除する。
- [x] 2: ルートの `httpx2` を削除する。VOICEVOXの上流環境で使う確認との切り分けを記録する。
- [x] 3: ルートの実行時依存から `setuptools` を外し、NeMoなどが必要とする推移依存と下限は維持する。
- [x] 4: `sincro-config` の実行時依存から `redis[hiredis]` を外す。例外分類テストのRedis依存を開発用として明示し、VoiceSynthesizerの本番依存を維持する。
- [x] 5: `python-dotenv` を開発用へ移し、既存の受け入れ確認スクリプトから引き続き利用できる。
- [x] 6: TextProcessorの `requests`、SpeechRecognizerNeMoの `onnx`、SpeechExtractor・SpeechRecognizerNeMo・VoiceSynthesizerの `pydantic`、VoiceSynthesizerの `numpy` の直接宣言を整理する。直接利用する共通パッケージの宣言と下限を維持する。
- [x] `uv.lock` が同期され、関係のないパッケージのバージョンが変わらない。サービス別の依存から不要導入が除かれる。
- [x] Pythonの型確認と対象テスト、タスク管理・変更Markdownの確認が通る。

## 設計判断

開発専用の依存は既存のルート `dev` グループへ集約する。
`requests.exceptions` を直接使う `sincro-config` へ `requests` の宣言を移す。
`onnx` と `requests` の既存制約を維持し、`setuptools` の下限も制約へ移す。
`pydantic` と `numpy` の下限は共通パッケージに同じ指定があるため追加しない。

## スコープ境界

ルートとPythonサービスの依存定義、ロックファイル、今回のタスク記録を変更する。
棚卸しの7（CSS変換）、ライブラリの更新、製品機能・通信契約・コンテナの稼働状態は対象外。

## 実装方針

`pyproject.toml` と対象5パッケージの `pyproject.toml` を変更し、`uv lock` で同期する。
既存の仮想環境に残ったパッケージで確認結果が変わらないよう、同期後の環境を使用する。

## テスト

- `uv lock --check`、`uv sync --locked --group dev --group full`。
- 変更前後のロックを照合し、残るパッケージの版とサービス別依存を確認する。
- `ty check .` とPythonサービスの既存テスト。外部サービス・GPUの実動作が必要な試験は通常の単体確認から分ける。
- `dotenv_values` の読み込みと、VOICEVOXの依存導入元の確認。
- 変更MarkdownのPrettier、相対リンク、タスク索引・管理検査。

## ドキュメント同期の要否

実行方法と製品の公開挙動を変更しないため、設計変更は不要。確認結果を本タスクへ記録する。

## 実施結果

依存定義と `uv.lock` を同期した。削除されたロック内のパッケージは `types-psutil`、`httpx2`、`httpcore2`、`httpx2-jsfetch`、`truststore` の5件。
残るパッケージのバージョン・取得元と、従来の制約が変わっていないことを変更前のロックとの比較で確認した。

サービス別の依存を追加機能も含めて追跡し、次のパッケージが本番グループから外れたことを確認した。

| サービス             | 外れたパッケージ                                  |
| -------------------- | ------------------------------------------------- |
| SpeechExtractor      | `python-dotenv`、`setuptools`、`redis`、`hiredis` |
| SpeechRecognizerNeMo | `python-dotenv`、`redis`、`hiredis`               |
| TextProcessor        | `python-dotenv`、`setuptools`、`redis`、`hiredis` |
| VoiceSynthesizer     | `python-dotenv`、`setuptools`                     |

各サービスで必要な `pydantic`、`numpy`、`requests`、`websockets` が残ることも確認した。
`python-dotenv` の開発用移動後も、`dotenv_values` でメモリー上の検証用設定を読める。
既存の[受け入れ確認スクリプト](../task-260915031111-mastra-text-stream-adapter/acceptance/mastra_smoke.py)は引き続き開発環境で利用する。

VOICEVOX向けの[確認コード](../../../Docker/voicevox/check_streaming_ramp.py)は上流Engineのテストを参照する。
[Dockerfile](../../../Docker/voicevox/Dockerfile)は上流Engine自身の `pyproject.toml` と `uv.lock` をコピーして導入しており、今回のルート依存削除はその環境を変更しない。

## 確認結果

- `uv lock --offline --check`: 成功。
- `uv sync --offline --locked --group dev --group full`: 成功。既存キャッシュで対象パッケージを再構築し、不要な導入済みパッケージを除去した。
- `.venv/bin/ty check .`: 成功。
- `.venv/bin/python -m pytest -q` に共通設定・共通モデル・音声区間抽出・NeMo認識・文章処理・音声合成の各 `tests` を指定: 255件と7サブテストが成功。中央ログ結合試験専用の1件は既存条件で省略された。
- 最初のpytest実行は制限環境内で収集が進まず中断した。権限を拡張して同じ対象を再実行し、成功した。コード修正による再試行はない。
- 開発環境から `types-psutil`、`httpx2`、`httpcore2`、`truststore` が除去されたことをパッケージメタデータで確認した。
- 変更MarkdownのPrettier・相対リンク、`git diff --check`、`tasks:index:check`、`tasks:check`: 成功。

コンテナ再ビルド、実GPU・外部サービスとの結合試験は今回の確認範囲に含めない。
本番コード・通信契約・既存の起動方法は変更していない。
