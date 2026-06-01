# TASK-3016 起動前 dialog の完全 React 化と platform adapter 最小化

- 作成日: 2026-04-22
- ステータス: Done
- 優先度: High

## 目的

起動前設定 dialog を完全に React 主導へ移行しつつ、残るブラウザ API 境界は最小の platform adapter として整理し、旧 DOM selector ベースの互換層を縮退させる。

## 背景

- 起動前 dialog は `ConfigurationDialogSettingsPanel` により大半が React 化済みである。
- しかし `configurationDialog.html` には bridge DOM が残っており、`DialogBridgeDomAdapter` も dialog 本体、VRM file input、drag & drop、open/close を扱っている。
- 一方で current state の残存 DOM 依存はかなり小さく、`HTMLDialogElement` や file picker のようなブラウザ API 境界まで無理に React 化する価値は高くない。
- Debug Console と並んで、通常導線側に残る代表的な active 負債になっている。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3015-debug-console-react-migration-and-diagnostics-core-split.md`

## スコープ

- 起動前 dialog view / interaction の完全 React 化
- bridge DOM の縮退または最小化
- `DialogBridgeDomAdapter` の責務最小化
- file picker / drag & drop / dialog state の React 正規経路整理

## 非対象

- dialog 内の設定項目の大幅追加
- VRM file 保存ロジックそのものの再設計
- Debug Console の React 化
- settings shell の全面再設計

## 先行条件

- `TASK-3015` と並行も可能だが、Debug Console の整理後に着手すると UI 基盤を揃えやすい。
- 本タスクでは `DialogManager` の設定ルール全体を作り直さず、DOM 依存縮退に集中する。

## 対応方針

1. dialog の表示と操作を React 側へ寄せ、DOM adapter は最小化または削除する。
2. `HTMLDialogElement` や file picker のようなブラウザ API 境界は、必要なら薄い platform adapter として残す。
3. `vrmFileInput` と drag & drop を React の正式導線へする。
4. `open / close / backdrop / Esc` の扱いは React / AppController 側から追えるようにしつつ、platform API 呼び出し自体は薄い adapter に閉じ込めてもよい。
5. 旧 selector 互換を理由に bridge DOM を増やし直さない。

## 整理チェックリスト

### 1. React 主導化

- [ ] dialog の表示内容が React で正式に描画されている
- [ ] 開始、離脱、ファイル選択、drag & drop が React 側の操作として完結する
- [ ] dialog 状態が AppController / React hook から追える

### 2. platform boundary 最小化

- [ ] `configurationDialog.html` の bridge DOM が削除または最小残存理由付きに整理されている
- [ ] `DialogBridgeDomAdapter` が残る場合でも、`HTMLDialogElement` / file picker などの platform boundary に責務が限定されている
- [ ] 旧 selector 依存が React 正規経路へ置き換わっている

### 3. 動作維持

- [ ] file picker による VRM 選択が従来どおり動く
- [ ] drag & drop による VRM 更新が従来どおり動く
- [ ] dialog の開始導線と離脱導線が current UX を維持する

## 実装タスク

1. `configurationDialog.html`、`DialogBridgeDomAdapter.ts`、`DialogManager.ts` の DOM 依存箇所を棚卸しする。
2. VRM file picker と drag & drop の React 正規経路を設計する。
3. dialog open / close / backdrop / Esc 制御を React / AppController 側で扱えるように整理する。
4. bridge DOM を削除または最小化し、`DialogBridgeDomAdapter` は残すなら platform adapter として責務を限定する。
5. dialog hook と React コンポーネント側の state / event 経路を current state に合わせて整理する。
6. `documents/design/frontend_ui.md` と必要に応じて `frontend_migration_react.md` を更新する。
7. `cd sincromisor-frontend && npm run build` を実行し、dialog の手動確認を行う。

## 想定変更箇所

- `sincromisor-frontend/src/partials/configurationDialog.html`
- `sincromisor-frontend/src/ts/UI/DialogBridgeDomAdapter.ts`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/UI/DialogStateStore.ts`
- `sincromisor-frontend/src/react/dialog/**`
- 必要に応じて `sincromisor-frontend/src/ts/App/**`
- `documents/design/frontend_ui.md`
- 必要に応じて `documents/design/frontend_migration_react.md`

## 完了条件

- 起動前 dialog が React 主導の正式 UI になっている
- bridge DOM が撤去または大幅縮退している
- `DialogBridgeDomAdapter` が残る場合でも、責務が browser platform boundary に限定されている
- file picker、drag & drop、開始導線が従来どおり動作する
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

- 起動前 dialog で VRM 選択、drag & drop、開始、トップへ戻るが期待どおり動くことを確認する
- Esc や背景クリックの扱いが current UX と矛盾しないことを確認する
- React 側の state 更新と dialog UI 表示が同期していることを確認する

## 実施メモ

- 本タスクは `DialogBridgeDomAdapter を必ず消す` ことではなく、`dialog の正式経路を React に寄せつつ、platform boundary を最小責務へ閉じ込める` ことが目的である。
- 実装変更時は `documents/design/frontend_ui.md` の更新が必要になる。
