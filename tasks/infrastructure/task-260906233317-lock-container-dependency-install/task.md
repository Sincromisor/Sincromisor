# コンテナの依存導入をロックファイルに従わせる

## 背景 / 目的

2026-09-06、HEAD `5bc93dcb1130fe339e4e114a7c2294dd97497463` を調査した。
フロントDockerfileは `package-lock.json` コピー後に `npm install` を実行する一方、RTCのフロントビルドは `npm ci` を使う。
現役Pythonサービス4種類は `uv.lock` をコピーするが、`uv sync` にロック更新禁止の指定がない。
不整合時にビルド内だけで依存が再解決され得るため、レビュー済みロックから逸脱しないようにする。
根拠はユーザーのDockerfile更新調査と、リポジトリが管理するロックによる依存導入である。

## 完了条件（受け入れ条件）

- [x] フロントの依存導入を既存RTCと同じ `npm ci` にする。
- [x] speech-extractor、text-processor、voice-synthesizer、speech-recognizer-nemoの導入がロックを書き換えず、不整合なら失敗する。
- [x] Pythonの起動時に対象グループを除去したり依存を再解決したりせず、ビルドで導入した環境を使う。
- [x] 正常ロックで対象イメージをビルドでき、不整合な依存宣言では失敗する確認を残す。

## 実装方針 / スコープ境界

対象は `Docker/sincro-frontend/Dockerfile` と上記4種類のDockerfile。
[uv公式手順](https://docs.astral.sh/uv/guides/integration/docker/)に従い、
ソースコピー前後に合う `--locked` 等を使う。起動は `uv run --no-sync` 等で導入済み環境を使う。
`--frozen` だけで不整合を検出したと扱わない。前段ではワークスペースのソースが未コピーである点に注意する。
[npm公式手順](https://docs.npmjs.com/cli/v11/commands/npm-ci/)に従い、ロック不整合を失敗として扱う。

uv、mc、Hugging Face CLIの全面的な版固定、イメージの一括ダイジェスト固定、依存一括更新は含めない。
service-initializerの `uv tool install` はアプリのロック対象外。廃止済みNueは復旧しない。
NeMoのCUDAベース変更は別タスクが扱う。

## テスト

対象Dockerfileのビルドと、一時コンテナで対象グループの主要モジュールの読み込みを確認する。
一時コピーの依存宣言をロックと不整合にし、導入が失敗することを確認する。
実ロックファイルや既存の仮想環境は失敗確認に使わない。同じ方式の重複試験は増やさない。

## 文書同期 / 調査記録

[Compose設計](../../../documents/design/infrastructure/compose.md)へロック不整合時の失敗と依存更新手順を簡潔に反映する。
通信契約は変更しない。起票時はDockerfileと公式手順の静的確認のみで、動作不良を再現済みとは扱わない。

## 実行記録

通常変更として親が現在の作業ツリーで実装した。前段にも全ワークスペースの依存宣言があるため、
ソース未配置の前段は `uv sync --locked --no-install-workspace --group <対象>`、
配置後は `uv sync --locked --group <対象>` を使う。起動は `uv run --no-sync` とした。
フロント、speech-extractor、text-processor、voice-synthesizerは
`docker build -f Docker/<対象>/Dockerfile -t sincro-task:<対象> .` でビルド成功。
Python各サービスは `docker run --rm --network none ... uv run --no-sync python -c ...` で
対象パッケージと主要依存の読み込みに成功した。NeMoはCUDA更新・Nue整理後の最終イメージでまとめて確認する。

失敗確認には `/tmp/sincro-task-checks` 配下へ依存宣言・ロック・ワークスペースのメタデータだけをコピーした。
Pythonはルート宣言の `python-dotenv>=1.2.2` を `>=1.2.1` へ変更し、
導入済みPythonを指定した `uv sync --locked --no-install-workspace --group text-processor --dry-run` が
ロック更新が必要とのエラーで終了した。npmは `is-number=7.0.0` を宣言だけへ追加し、
`npm ci --ignore-scripts` が `EUSAGE` とロック内の依存欠落を報告した。
両ロックのSHA-256が元ファイルと一致することを確認し、実ロックや既存仮想環境は変更していない。

最終NeMoイメージ `sincro-task:nemo-final` のビルド、ネットワークなしでの
`uv run --no-sync` による主要モジュール読み込みとPyTorchのGPU演算にも成功した。
文書・コメント点検はPASS。既知の残リスクはない。
