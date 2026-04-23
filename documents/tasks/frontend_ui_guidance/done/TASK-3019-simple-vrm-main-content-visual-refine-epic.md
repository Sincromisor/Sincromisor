# TASK-3019 simple-vrm メインコンテンツ visual refine Epic

- 作成日: 2026-04-24
- ステータス: Done
- 優先度: High

## 目的

`simple-vrm` の開始後メインコンテンツを、起動前 dialog / 設定パネル / Debug Console と連続した dark / immersive な体験へ整理し、実機幅で破綻しない responsive 前提をそろえる。

## 背景

- `simple-vrm` の開始後画面は、React app shell へ集約された一方で visual は legacy CSS 依存が強く、起動前後で UI family が切り替わったように見える。
- 調査時点では、`meta viewport` 欠落、global centering を含む legacy reset、header / chat / telop の古い面表現が混在しており、1タスクでまとめて触ると実装判断がぶれやすい。
- このため、本件は `親タスク + 複数の実装タスク` に分解し、responsive 前提、layout 基盤、header、chat、telop、最後の設計同期を順に扱う。

## 関連設計

- `documents/design/frontend_ui.md`
- `DESIGN.md`

## 実装順

1. `TASK-3020` modern ページの viewport / responsive 前提是正
2. `TASK-3021` main content 向け legacy global style 影響の隔離
3. `TASK-3022` header と右上ツール導線の visual align
4. `TASK-3023` chat overlay の再設計
5. `TASK-3024` telop / footer overlay の再設計
6. `TASK-3025` shared ページ確認と設計文書同期

## 子タスク

- `documents/tasks/frontend_ui_guidance/done/TASK-3020-modern-pages-viewport-and-responsive-prerequisites.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3021-main-content-legacy-global-style-isolation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3022-simple-vrm-header-and-tool-chrome-visual-alignment.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3023-simple-vrm-chat-overlay-redesign.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3024-simple-vrm-telop-footer-overlay-redesign.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3025-main-content-design-sync-and-shared-page-verification.md`

## Epic の完了条件

- `simple-vrm` の開始後 main content が、起動前 dialog / 設定パネル / Debug Console と同じ design family に見える
- modern ページで `meta viewport` と breakpoint の前提が一致する
- legacy global reset による幅解釈や centering の副作用が main content で抑制される
- header / chat / telop が scene を塞ぎすぎない overlay として整理される
- `vrm360` / `looking-glass-vrm` で shared 変更による明確な崩れがない
- `documents/design/frontend_ui.md` が実装後の方針に追従している

## 実施メモ

- 本タスク自体では実装を直接抱え込まず、子タスクの境界管理と完了判定を担う。
- `DESIGN.md` は模倣対象ではなく、dark surface、情報密度、rounded geometry、elevation の原則を参照する。
- 完了記録:
  - `TASK-3020` から `TASK-3024` で viewport 前提、legacy global style の隔離、header / chat / telop overlay の整理を完了した。
  - `TASK-3025` で `documents/design/frontend_ui.md` の最終同期、`simple-vrm` desktop / mobile 確認、`vrm360` / `looking-glass-vrm` の shared shell 確認を実施した。
  - 2026-04-24 時点で `cd sincromisor-frontend && npm run build` は成功し、shared 変更による modern 3 ページの明確な崩れは確認されなかった。
