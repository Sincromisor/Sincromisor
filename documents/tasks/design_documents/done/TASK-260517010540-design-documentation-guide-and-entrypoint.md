# TASK-260517010540 設計ドキュメント運用ガイドと導線整備

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: Medium

## 目的

肥大化した `documents/design` を段階的に整理する前に、設計文書の種別、更新手順、分割基準、導線ルールを正本化する。

## 背景

- 現状の設計文書はファイル名ベースの一覧になっており、目的別に入口を選びにくい。
- `frontend_ui.md` や `frontend_migration_react.md` では、現在設計、移行計画、作業ログ、検証結果が混在している。
- 再編を進める前に、どの情報をどこへ置くかのルールが必要である。

## スコープ

- 設計ドキュメント運用ガイドの追加
- 文書種別別テンプレートの追加
- `documents/design/index.md` からの導線追加

## 非対象

- 既存設計文書の全面移動
- `frontend_ui.md` / `frontend_migration_react.md` の分割実施
- 通信契約や実装内容の変更

## 対応内容

- `documents/design/documentation-guide.md` を追加した。
- `documents/design/templates/` に Current Design、Contract Spec、Decision Record、Initiative Plan のテンプレートを追加した。
- `documents/design/index.md` に、運用ガイドとテンプレートへの入口を追加した。

## 完了条件

- [x] 設計文書の扱い方を説明する資料がある
- [x] 新規文書作成時に使うテンプレートがある
- [x] `documents/design/index.md` から資料へ辿れる

## 確認

- Markdown のリンクと構成を確認する。
