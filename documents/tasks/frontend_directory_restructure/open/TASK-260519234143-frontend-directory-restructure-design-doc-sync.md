# TASK-260519234143 frontend directory restructure design doc sync

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

フロントエンドの新しい物理構成を設計文書へ反映し、実装と `documents/design` の正本がずれないようにする。

## スコープ

- `documents/design/frontend/app-shell.md` の更新
- `documents/design/frontend/pages.md` の更新
- `documents/design/frontend/settings-and-debug-ui.md` の更新
- `documents/design/frontend/character/*` の path / 責務説明更新
- 必要に応じた `documents/design/index.md` の参照更新

## 非対象

- 実装ファイルの移動
- 既存設計方針の大幅な変更
- endpoint / JSON 契約変更

## 完了条件

- 設計文書上の path が実装構成と一致している
- app / features / character / shared / pages の責務が説明されている
- 後続担当者が新規ファイルの置き場所を判断できる

## 確認

- `documents/design/frontend/*` の旧 path 参照が残っていないことを確認する
- 必要に応じて `npm run check` の Markdown format 対象を確認する
