# コンテナの依存導入をロックファイルに従わせる

## 背景 / 目的

2026-09-06、HEAD `5bc93dcb1130fe339e4e114a7c2294dd97497463` を調査した。
フロントDockerfileは `package-lock.json` コピー後に `npm install` を実行する一方、RTCのフロントビルドは `npm ci` を使う。
現役Pythonサービス4種類は `uv.lock` をコピーするが、`uv sync` にロック更新禁止の指定がない。
不整合時にビルド内だけで依存が再解決され得るため、レビュー済みロックから逸脱しないようにする。
根拠はユーザーのDockerfile更新調査と、リポジトリが管理するロックによる依存導入である。

## 完了条件（受け入れ条件）

- [ ] フロントの依存導入を既存RTCと同じ `npm ci` にする。
- [ ] speech-extractor、text-processor、voice-synthesizer、speech-recognizer-nemoの導入がロックを書き換えず、不整合なら失敗する。
- [ ] Pythonの起動時に対象グループを除去したり依存を再解決したりせず、ビルドで導入した環境を使う。
- [ ] 正常ロックで対象イメージをビルドでき、不整合な依存宣言では失敗する確認を残す。

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
