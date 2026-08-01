# service-initializer の uv 初期化依存を解消する

<!--
  起票の入口は /new-task（起票 + 独立レビューを一括）。既存 task.md を後から再レビューする
  場合は /review-task <task-dir> を使う。いずれも APPROVED を得てから /run-task に渡す。
  各節は tasks/AUTHORING-CHECKLIST.md（task-reviewer 評価観点の正本）に対応する。
  初回 NEEDS_REVISION の最頻出根拠は「設計判断の未確定」と「ドキュメント同期要否の未記載」。
-->

## 背景 / 目的

`Docker/service-initializer/Dockerfile` は Hugging Face CLI の導入に `uv init` と `uv add` を使い、
最後に `uv init` が生成することを前提として `main.py` を削除している。uv の生成する project
レイアウトが変わると `rm main.py` が失敗し、`service-initializer` と、それに依存する compose
全体を build できない。

Hugging Face CLI を uv の tool として導入し、Python project の生成仕様への不要な依存を解消する。
compose の責務は `documents/design/infrastructure/compose.md` を参照する。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [x] `service-initializer` の build が `main.py` の有無に依存せず成功する。
- [x] build 後のイメージで、`sincromisor` ユーザーが `hf --help` を実行できる。
- [x] `initialize.sh` が project 環境を介さず、tool として導入した `hf` を実行する。

## 設計判断（着手前に確定済み）

- `hf` はアプリケーション依存ではないため、`uv tool install huggingface-hub` で独立した CLI として導入する。
- `huggingface-hub[cli]` は現行版で存在しない extra の警告が出るため使用しない。
- `initialize.sh` は uv project の探索を行う `uv run` を介さず、導入された `hf` の絶対パスを実行する。
- 外部モデル取得時の失敗挙動は既存どおりとし、キャッシュ一覧の失敗だけを許容する。

## スコープ境界

- 対象: `service-initializer` における Hugging Face CLI の導入方法と実行方法。
- 非対象: モデル選択、キャッシュ構成、S3 初期化、他サービスの Python 依存管理。

## 実装方針（既存コード整合: file:line）

- `Docker/service-initializer/Dockerfile:32` の uv 導入後に `uv tool install` を実行し、project
  生成と生成物削除を廃止する。
- `Docker/service-initializer/initialize.sh:18` 以降の `hf` 呼び出しから `uv run` を除去する。

## テスト

- `docker compose build service-initializer`
- build 済みイメージ内で `su sincromisor -c '/opt/sincromisor/.local/bin/hf --help'`
- `npm run tasks:index:check`
- `npm run tasks:check`

## ドキュメント同期の要否

不要。compose の service、環境変数、volume、起動時のモデル取得挙動は変更せず、イメージ内の
CLI 導入方法だけを修正する。
