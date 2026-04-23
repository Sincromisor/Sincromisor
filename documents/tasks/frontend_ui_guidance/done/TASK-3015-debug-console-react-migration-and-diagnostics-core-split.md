# TASK-3015 Debug Console の React 化と diagnostics core 分割

- 作成日: 2026-04-22
- ステータス: Done
- 優先度: High

## 目的

`debugConsole.html` と `DebugConsoleManager` に集中している DOM 管理、表示ロジック、イベント橋渡しを整理し、Debug Console を React UI と軽量な diagnostics core へ分割する。

## 背景

- 現在の Debug Console は巨大な HTML partial と巨大な `DebugConsoleManager` に依存している。
- `DebugConsoleManager` は DOM 取得、タブ制御、RTC 表示、オーディオメーター、トレンドグラフ、イベント配信、設定パネルの開閉連携まで抱えており、責務が重い。
- React 側の通常 UI はかなり進んでいるのに、診断 UI だけが旧 DOM 管理のまま残っており、次のリファクタの障害になっている。
- 通常利用導線に残る active な負債としては、Debug Console が最も大きい。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3014-babylon-legacy-code-removal-and-dependency-cleanup.md`

## スコープ

- Debug Console view の React 化
- `DebugConsoleManager` の責務分割
- diagnostics state / event bridge の整理
- `debugConsole.html` partial 依存の縮退
- 右側ツール領域の状態、開閉、排他制御 ownership の明確化

## 非対象

- VAD / CharacterGaze / RTC getStats ロジック自体の再設計
- 診断項目の大幅追加
- 起動前 dialog の React 化
- 設定パネル全体の再設計

## 先行条件

- `TASK-3014` により Babylon legacy を落としてから着手するのが望ましい。
- 本タスクでは診断 UI の置き換えに集中し、RTC / 音声アルゴリズムは変えない。

## 対応方針

1. まず Debug Console を `React view` と `diagnostics data provider` に分ける。
2. `DebugConsoleManager` は UI manager ではなく、段階的に `diagnostics bridge/service` へ縮退させる。
3. `debugMenu`、設定パネル開閉、Debug Console 開閉、相互排他を含む `右側ツール領域` の状態は App / React 正規経路で所有する。
4. `DebugConsoleManager` は右側ツール領域全体の owner ではなく、diagnostics データ提供側へ縮退させる。
5. partial 側の静的 DOM 依存を減らし、React mount を正式経路にする。
6. 設定パネルとの排他表示や開閉ルールは壊さず、移行後も同じ UX を維持する。

## 分割チェックリスト

### 1. React view 化

- [x] Debug Console 本体が React コンポーネント化されている
- [x] タブ切替、概要表示、Audio、Channels、SDP が React 側で描画される
- [x] トレンド表示や状態表示が React view から扱える

### 2. diagnostics core 分割

- [x] `DebugConsoleManager` から DOM 直操作責務が分離されている
- [x] イベント配信と snapshot 取得の責務が整理されている
- [x] React 側が購読・描画する正規経路が定義されている

### 3. 右側ツール領域 ownership

- [x] `debugMenu`、設定パネル、Debug Console の開閉状態を誰が所有するか明文化されている
- [x] 右側ツール領域の状態は App / React 正規 API から操作できる
- [x] Debug Console 移行後も設定パネルとの相互排他ルールが維持されている

### 4. partial 依存縮退

- [x] `debugConsole.html` の役割が縮退または削除されている
- [x] React mount が正式経路になっている
- [x] 設定パネルとの排他制御が current UX を維持している

## 実装タスク

1. `debugConsole.html` と `DebugConsoleManager.ts` の責務を棚卸しし、view / state / event / interaction を分離する。
2. Debug Console の React コンポーネント群を設計し、既存 UI 構造を React へ移す。
3. `DebugConsoleManager` を段階的に split し、DOM 管理責務を削る。
4. React 側で diagnostics event / snapshot を購読する hook や state bridge を整える。
5. `debugMenu`、設定パネル開閉、Debug Console 開閉、排他表示の state owner を App / React 側へ定義し、正規 API を整える。
6. 設定パネルとの排他表示、開閉、停止ボタンの連携を React 側で維持する。
7. `debugConsole.html` partial の縮退または削除を行う。
8. `documents/design/frontend_ui.md` と必要に応じて `frontend_migration_react.md` を更新する。
9. `cd sincromisor-frontend && npm run build` を実行し、動作確認を行う。

## 想定変更箇所

- `sincromisor-frontend/src/partials/debugConsole.html`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- 必要に応じて `sincromisor-frontend/src/ts/App/**`
- `sincromisor-frontend/src/react/**`
- 必要に応じて `sincromisor-frontend/src/*/main-react.tsx`
- 必要に応じて `sincromisor-frontend/src/styles/*.css`
- `documents/design/frontend_ui.md`
- 必要に応じて `documents/design/frontend_migration_react.md`

## 完了条件

- Debug Console が React UI で正式に描画されている
- `DebugConsoleManager` の DOM 直操作責務が大きく減っている
- 右側ツール領域の状態と開閉 API が App / React 正規経路へ寄っている
- partial 依存が縮退し、React mount が正規経路になっている
- 設定パネルとの排他制御や停止導線が維持されている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

- Debug Console の主要タブが React 側で描画されることを確認する
- Overview、Audio、SDP 等の診断情報が従来どおり見られることを確認する
- 設定パネルと Debug Console が同時表示されず、切替ルールが維持されていることを確認する

## 実施メモ

- 本タスクは `DebugConsoleManager を少し整理する` のではなく、`旧 DOM 主導の診断 UI を React 正式導線へ移す` のが目的である。
- 実装変更時は `documents/design/frontend_ui.md` の更新が必要になる。
- 2026-04-24 確認:
  - `src/react/debug/DebugConsole.tsx` と `src/react/debug/RightToolMenu.tsx` により、Debug Console と右側ツール UI は React 正式経路で描画されている。
  - `src/ts/UI/DebugConsoleManager.ts` は diagnostics snapshot provider / callback bridge として残り、DOM 直操作責務は除去されている。
  - `src/ts/App/SincroAppRightToolPanelService.ts` と `appController.debug.*` 経路で、設定パネルと Debug Console の開閉・相互排他を App / React 側で所有している。
  - `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` は current structure を反映済みである。
  - `cd sincromisor-frontend && npm run build` は 2026-04-24 に成功した。
