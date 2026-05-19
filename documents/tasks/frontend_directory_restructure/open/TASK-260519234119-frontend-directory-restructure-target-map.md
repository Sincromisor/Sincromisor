# TASK-260519234119 frontend directory restructure target map

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

フロントエンドの責務別ディレクトリ再編について、移動先、依存方向、実施順を先に固定し、後続タスクが場当たり的な rename にならないようにする。

## 背景

現状は `src/ts` / `src/react` の技術別配置と、`src/ts/rtc` / `src/ts/ui` などの広い責務名が混在している。特に RTC、UserMedia、VAD、会話状態、Debug Console、settings UI が物理的に近すぎるため、変更影響が読みづらい。

## スコープ

- 現在 path と移動先 path の対応表作成
- feature / app / character / shared / pages の責務定義
- 許可する依存方向と禁止する依存方向の整理
- タスク実施順と分割単位の確認

## 非対象

- 実ファイルの移動
- import path の変更
- runtime 挙動変更

## 完了条件

- 移動前後対応表が文書化されている
- 後続タスクの実施順が明確になっている
- `features/rtc` から React UI へ直接依存しない等の境界ルールが明記されている
- 設計文書更新が必要な対象が列挙されている

## 確認

- 後続タスクが 1 タスク 1 コミット相当の粒度になっていることを確認する
- URL ルート変更の有無と再デプロイ影響を確認する
