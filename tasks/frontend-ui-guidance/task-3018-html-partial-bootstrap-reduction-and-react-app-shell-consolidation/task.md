# TASK-3018 HTML partial / bootstrap 縮退と React app shell 集約

- 作成日: 2026-04-22
- ステータス: Done
- 優先度: Medium

## 目的

残存している HTML partial ベースの UI 構成とページごとの分散 bootstrap を整理し、React app shell を中心とした modern なフロントエンド構成へ寄せる。

## 背景

- 現状の modern 系ページでは `main-react.tsx` による React island mount が進んでいるが、UI の骨格はまだ HTML partial に支えられている。
- `baseHeader.html`、`sincroBody.html`、`configurationDialog.html`、`debugConsole.html` と custom `htmlPartialsPlugin` は、移行期には有効だったが、React 化が進んだ現在は構成を分かりにくくしている。
- `TASK-3015` と `TASK-3016` が進むと、partial に残る役割はさらに減る見込みであり、ここで bootstrap と app shell を整理する価値が高い。
- ページごとの `main-react.tsx` も類似度が高く、現状は island mount の薄い差分だけが重複している。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3015-debug-console-react-migration-and-diagnostics-core-split.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3016-full-react-startup-dialog-and-bridge-dom-removal.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3017-ui-manager-layer-reduction-and-app-service-consolidation.md`

## スコープ

- HTML partial の縮退または削除
- `htmlPartialsPlugin` の必要性再評価
- modern 系ページの bootstrap 共通化
- React app shell の集約

## 非対象

- SPA への全面移行
- router 導入
- 各ページの scene ロジック統合
- デザイン刷新

## 先行条件

- `TASK-3015` と `TASK-3016` により、partial に残る active UI が減ってから着手するのが望ましい。
- 本タスクでは MPA 構成自体は維持しつつ、shell と bootstrap を modern 化する。

## 対応方針

1. partial は `移行のために残ったもの` と `今も本当に必要なもの` を分ける。
2. mount topology の end state は `MPA のまま、ページごとに単一の React app shell root を持ち、その内部で panel / chat / telop / dialog / debug を描画する` ことを第一候補とする。
3. `htmlPartialsPlugin` は必要性が薄れたら撤去する。
4. MPA は維持しつつ、各ページの UI 起動構造はできるだけ揃える。

## 整理チェックリスト

### 1. partial 縮退

- [x] `baseHeader.html` の扱いが整理されている
- [x] `sincroBody.html` の扱いが整理されている
- [x] `configurationDialog.html` と `debugConsole.html` の縮退結果が反映されている
- [x] `htmlPartialsPlugin` を残す理由があるか再評価されている

### 2. bootstrap 共通化

- [x] `simple-vrm`、`vrm360`、`looking-glass-vrm` の React bootstrap 差分が整理されている
- [x] 共通 mount ロジックが shared 化されている
- [x] scene 差分と UI shell 差分が分離されている
- [x] mount topology の目標が `単一 app shell root` か `multi-root shared helper` かで明文化されている

### 3. app shell 集約

- [x] React app shell の責務が定義されている
- [x] ページごとの UI 起動構造が揃っている
- [x] 設計文書が current structure を反映している

## 実装タスク

1. 現在の partial 群と `htmlPartialsPlugin` の役割を棚卸しする。
2. `TASK-3015` と `TASK-3016` の結果を踏まえ、不要になった partial を縮退または削除する。
3. `main-react.tsx` 群の共通 mount ロジックを整理し、shared bootstrap を検討する。
4. modern 系ページの app shell 責務を定義し、React 主導構成へ寄せる。
5. 必要に応じて `vite.config.js` の partial plugin 構成を簡素化する。
6. `documents/design/frontend_ui.md` と `frontend_migration_react.md` を更新する。
7. `cd sincromisor-frontend && npm run build` を実行し、modern 系ページの起動確認を行う。

## 想定変更箇所

- `sincromisor-frontend/vite.config.js`
- `sincromisor-frontend/src/partials/*.html`
- `sincromisor-frontend/src/simple-vrm/main-react.tsx`
- `sincromisor-frontend/src/vrm360/main-react.tsx`
- `sincromisor-frontend/src/looking-glass-vrm/main-react.tsx`
- 必要に応じて `sincromisor-frontend/src/react/**`
- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`

## 完了条件

- partial 依存が current state に見合う最小構成へ縮退している
- React bootstrap がページ横断で整理されている
- modern 系ページの UI 起動構造が揃っている
- mount topology の end state が実装と文書で明文化されている
- `htmlPartialsPlugin` の必要性が見直され、不要なら削除されている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

- modern 系ページで UI 起動構造が揃っていることを確認する
- partial を残す場合も、その理由が説明できることを確認する
- build 成功後に `simple-vrm`、`vrm360`、`looking-glass-vrm` の主要 UI が従来どおり表示されることを確認する

## 実施メモ

- 本タスクは `SPA 化` ではなく、`MPA のままでも app shell を整理して modern 化する` タスクである。
- 実装変更時は `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` の更新が必要になる。
- 実施結果:
    - `src/react/app-shell/SincroPageAppShell.tsx` と `bootstrapSincroPageAppShell.tsx` を追加し、modern 3 ページの UI 骨格を単一 React root に集約した。
    - `src/partials/*.html` と `vite.config.js` の `htmlPartialsPlugin` を削除し、各ページ HTML は `div#sincroPageRoot` を持つ最小エントリへ簡素化した。
    - `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` を current structure に合わせて更新した。
    - `cd sincromisor-frontend && npm run build` は 2026-04-22 に成功した。
