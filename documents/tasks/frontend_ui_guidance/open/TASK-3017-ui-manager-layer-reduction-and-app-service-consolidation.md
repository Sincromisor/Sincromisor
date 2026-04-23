# TASK-3017 UI manager 層の縮退と App / service 層への統合

- 作成日: 2026-04-22
- ステータス: Open
- 優先度: High

## 目的

`src/ts/UI/*Manager.ts` に残る旧 UI 管理責務を整理し、React / AppController 時代に不要になった manager 層を縮退させて、App 層または純粋 service 層へ統合する。

## 背景

- React 側はすでに manager 直接参照をかなり減らしており、`SincroAppController` / bridge 経由が正規導線になりつつある。
- 一方で `src/ts/UI` には `ChatMessageManager`、`DebugConsoleManager`、`DialogManager`、`PopManager` など 11 ファイルが残っており、旧 UI 基盤の名残がまだ大きい。
- `TASK-3015`、`TASK-3016` で Debug Console と dialog の React 化が進むと、manager 層をさらに減らせる見込みが高い。
- ここを残したままだと、`UI ロジックの正規置き場` が曖昧なままで、今後の保守性が頭打ちになる。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3011-react-app-controller-boundary-and-ui-dependency-reduction.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3015-debug-console-react-migration-and-diagnostics-core-split.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3016-full-react-startup-dialog-and-bridge-dom-removal.md`

## スコープ

- `src/ts/UI/*` の責務再棚卸し
- manager / store / service / bridge の再分類
- 不要 manager の縮退
- AppController 経由の責務集約
- 右側ツール領域 state owner と開閉 API の整理

## 非対象

- React UI デザインの大幅変更
- RTC / Media / VAD / CharacterGaze アルゴリズムの再設計
- Babylon legacy の削除そのもの
- HTML partial の全面削除

## 先行条件

- `TASK-3015` と `TASK-3016` の進捗を踏まえて着手するのが望ましい。
- 本タスクでは `UI 層の置き場` を整理するのであり、全クラスを無理に `AppController` へ詰め込むことは目的としない。

## 対応方針

1. `manager` という名前で残す意味があるものと、service / store / bridge に分けるべきものを区別する。
2. React view から不要になった DOM 主導 manager は削除対象とする。
3. `AppController` は UI の正規窓口として責務を集約するが、巨大化しすぎないよう helper / service 分割も維持する。
4. `debugMenu`、設定パネル、Debug Console を含む `右側ツール領域` の state owner は App / React 正規経路へ寄せる。
5. 命名と責務を揃え、初見で `どこを触ればよいか` が追える構造を目指す。

## 整理チェックリスト

### 1. 再分類

- [ ] `src/ts/UI/*` の各ファイルが、manager / service / store / bridge のどれに当たるか整理されている
- [ ] `manager` の名前を残すべきものと改名・統合すべきものが区別されている
- [ ] React view から不要になった DOM 主導責務が整理されている

### 2. App / service 統合

- [ ] `AppController` とその helper に寄せる責務が整理されている
- [ ] 独立 service として残す責務が整理されている
- [ ] state store と UI interaction の境界が整理されている

### 3. 右側ツール領域 ownership

- [ ] `debugMenu`、設定パネル、Debug Console の state owner が App / React 側に定義されている
- [ ] 右側ツール領域の開閉 API が React から正規経路で呼べる
- [ ] `DebugConsoleManager` が右側ツール領域全体の owner ではなくなっている

### 4. 可読性

- [ ] 命名とディレクトリ構成から責務が読める
- [ ] React UI 側から触る正規 API が追いやすい
- [ ] 設計文書が current structure に追従している

## 実装タスク

1. `src/ts/UI/*` を棚卸しし、各ファイルの current role を整理する。
2. `DebugConsoleManager`、`DialogManager`、`ChatMessageManager`、`PopManager` を中心に、残す / 改名 / 分割 / 削除の方針を決める。
3. AppController / bridge / service / store へ寄せる責務を具体化する。
4. `debugMenu`、設定パネル、Debug Console を含む右側ツール領域の state owner と開閉 API を整理する。
5. 不要 manager の削除または縮退を実施する。
6. 必要に応じてファイル名や配置を整理する。
7. `documents/design/frontend_ui.md` と `frontend_migration_react.md` を更新する。
8. `cd sincromisor-frontend && npm run build` を実行し、主要導線の動作確認を行う。

## 想定変更箇所

- `sincromisor-frontend/src/ts/UI/**`
- `sincromisor-frontend/src/ts/App/**`
- `sincromisor-frontend/src/react/**`
- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`

## 完了条件

- `src/ts/UI` の責務が current architecture に合わせて整理されている
- React / AppController 時代に不要な manager が縮退している
- 右側ツール領域の state owner と開閉 API が App / React 正規経路へ揃っている
- App / service / store / bridge の境界が読み取りやすくなっている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

- React UI からの正規経路が `AppController` / bridge 系に揃っていることを確認する
- `src/ts/UI` の残存ファイルに、残す理由が説明できることを確認する
- manager 名と実責務が食い違っていないことを確認する

## 実施メモ

- 本タスクは `manager を全部消す` のではなく、`現在の責務に合わない manager 層を減らす` ためのタスクである。
- 実装変更時は `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` の更新が必要になる。
