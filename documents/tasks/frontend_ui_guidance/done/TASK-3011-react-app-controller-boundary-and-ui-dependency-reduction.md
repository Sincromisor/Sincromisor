# TASK-3011 React UI の残存 direct manager 依存整理と AppController 経由への移行

- 作成日: 2026-04-21
- ステータス: Done
- 優先度: High

## 目的

すでに定義済みの `SincroAppController` / bridge を正規経路として前提にしつつ、React 側に残っている `manager singleton 直接参照` や同種の例外依存を棚卸しし、移行対象と移行順を整理する。

## 背景

- `documents/design/frontend_ui.md` では、`SincroAppController` の `dialog / chat / debug / rtc` bridge が UI 層の主要窓口として整理されている。
- 実装側も `sincromisor-frontend/src/ts/App/SincroAppController.ts` でその構成に寄っており、`UI 境界をこれからゼロから定義する` 段階ではない。
- 一方で React 側には、`SincroChatView.tsx` の `ChatMessageManager.getManager()` や `SincroTelopView.tsx` の `TalkManager.getManager()` のような direct manager 依存が残っている。
- 未整理なのは `正規経路の不在` ではなく、`正規経路へまだ寄せ切れていない例外箇所` である。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3008-frontend-modernization-foundation-and-legacy-retirement.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3009-frontend-support-matrix-and-page-classification.md`

## スコープ

- React 側に残る direct manager 依存箇所の棚卸し
- 各依存箇所の `既存 bridge へ寄せる` / `bridge 拡張が必要` / `暫定維持` の分類
- 優先度の高い direct manager 依存の移行
- 新規 React 実装で direct manager 依存を増やさないルールの明文化
- 設計文書への反映

## 非対象

- `SincroAppController` / bridge の全面再設計
- すべての `UI/*Manager.ts` の即時削除
- HTML partial や bridge DOM の全面撤去
- RTC / Media / 3D 描画ロジックそのものの再設計
- Babylon legacy ページの退役実施
- ページ分類や公開導線の再判断

## 先行条件

- `TASK-3009` で優先対象として整理した modern 系ページを前提に、React 側の例外依存だけを扱う。
- `single` / `double` など legacy 扱いの導線判断は本タスクで再議論せず、必要な bridge / UI 依存の縮退に限定する。

## 対応方針

1. `SincroAppController` / bridge がすでに正規経路である前提を崩さず、例外箇所だけを対象化する。
2. direct manager 依存は `残っている理由` と `移行先` をセットで棚卸しする。
3. React から参照する API は `appController.dialog/chat/debug/rtc/state` に寄せ、足りない場合だけ bridge 追加を検討する。
4. 例外箇所を把握しないまま一般論の `境界整理` を広く書かず、移行対象一覧と優先順位を成果物に含める。

## 整理チェックリスト

### 1. 例外箇所の把握

- [x] React コンポーネントや hook で direct manager 依存している箇所が一覧化されている
- [x] 各箇所について、何の state / event / action を取りたいのか整理されている
- [x] `既存 bridge で吸収可能か`、`bridge 拡張が必要か`、`暫定維持か` が判定されている

### 2. 移行方針

- [x] 優先的に移行すべき direct manager 依存が特定されている
- [x] `SincroChatView`、`SincroTelopView` など代表的な例外箇所の扱いが整理されている
- [x] 新規 React 実装で manager singleton を直接触れないルールが明文化されている

### 3. 文書同期

- [x] `frontend_ui.md` の正規経路説明と残存例外の扱いが一致している
- [x] `frontend_migration_react.md` に移行対象一覧または優先順位が反映されている
- [x] 後続担当者が `次にどの依存を寄せるか` 判断できる

## 実装タスク

1. React コンポーネント、hook、initializer からの direct manager 依存箇所を棚卸しする。
2. 各箇所を `既存 bridge へ移行`、`bridge 拡張後に移行`、`暫定維持` に分類する。
3. 優先度の高い direct manager 依存から、`SincroAppController` / bridge 経由へ寄せる。
4. 新規 React 実装ルールとして、manager singleton 直接参照を増やさない原則を文書化する。
5. `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` に残存例外と移行方針を反映する。

## 想定変更箇所

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `sincromisor-frontend/src/ts/App/**`
- `sincromisor-frontend/src/react/**`
- 必要に応じて `sincromisor-frontend/src/ts/UI/**`

## 完了条件

- React 側の direct manager 依存箇所が一覧化されている
- 各依存箇所に `移行先` と `優先度` が設定されている
- 優先対象の direct manager 依存が `SincroAppController` / bridge 経由へ寄せられている
- 新規 React 実装で direct manager 依存を増やさないルールが明文化されている

## 確認

- 既存設計が示す `SincroAppController` 中心の正規経路と矛盾していないことを確認する
- `境界を定義する` ではなく `残存例外を減らす` タスクになっていることを確認する
- 残す direct manager 依存について、暫定理由が曖昧でないことを確認する

## 実施メモ

- 本タスクは `UI 境界の新規定義` ではなく、`すでに定義済みの境界へ例外箇所を寄せる` ためのタスクである。
- 実装変更に着手した場合は、`documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` の更新が必要になる。
- 2026-04-22 実施内容:
  - React 側の direct manager 依存は `SincroChatView` の `ChatMessageManager.getManager()` と `SincroTelopView` の `TalkManager.getManager()` に限定されていることを確認した。
  - `SincroAppController` の `chat` / `state` bridge と `SincroAppEvent` を拡張し、chat view snapshot、system icon 更新、telop snapshot、旧 DOM 描画停止を AppController 経由で扱えるようにした。
  - React UI では `subscribeActiveSincroAppEvents(...)` を正規経路として使い、manager singleton の direct import / `getManager()` を行わないルールを `documents/design/frontend_migration_react.md` に反映した。
