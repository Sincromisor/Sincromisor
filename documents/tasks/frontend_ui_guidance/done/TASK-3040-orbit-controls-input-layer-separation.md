# TASK-3040 OrbitControls 入力レイヤー分離と overlay event 責務整理

- 作成日: 2026-05-02
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3033`
- 依存: `TASK-3027`, `TASK-3029`, `TASK-3038`

## 目的

`OrbitControls` が Debug Console / Settings / chat overlay などの UI 操作を誤って受け取らないよう、3D キャラクター操作用の入力領域を UI 全体から分離する。右側ツール領域や Debug Console 側で個別に `stopPropagation` や `pointerdown` 代替処理を増やす状態を解消し、クリック・タブ切り替え・details 開閉・スクロールが安定する構造へ戻す。

## 背景

- 現在の simple-vrm では、`SincroVRMInitializer` が `div#sincroBody` を `OrbitControls` の `controlTarget` として渡している。
- `div#sincroBody` は header / chat / right tool frame / Debug Console / Settings などを含むページ全体の shell である。
- そのため、右側ツール領域内の wheel や pointer 操作が `OrbitControls` へ届き、Debug Console のスクロールと同時にキャラクターが zoom in/out する。
- 以前「messageBox の上でも OrbitControls を効かせる」ために z-index や pointer-events を調整した可能性があり、現在は UI 側でイベント遮断を積み増す複雑な構造になっている。
- 本来は `OrbitControls` の入力対象を「キャラクター操作を許可する hit layer」に限定し、UI overlay はその上に通常の UI として配置するべきである。

## スコープ

- `OrbitControls` の接続先要素の見直し
- 3D キャラクター操作用 hit layer の追加または既存 canvas wrapper の責務整理
- simple-vrm の overlay z-index / pointer-events 整理
- Debug Console / Settings / Header / chat / telop と OrbitControls のイベント境界整理
- 前回の応急処置が残っている場合の撤去または単純化
- `simple-vrm` を主対象にした Playwright での操作確認
- 必要に応じた `documents/design/frontend_ui.md` または該当 frontend design 文書の同期

## 非対象

- WebRTC / RTC signaling の仕様変更
- VRM の姿勢制御、表情制御、視線追従ロジックの変更
- Debug Console の情報設計や見た目の再設計
- SettingsShell のカテゴリ構成変更
- Looking Glass polyfill 固有の canvas pointer workaround の大規模整理

## 実装方針

1. `OrbitControls` を `div#sincroBody` へ接続する構造をやめる。
2. キャラクター操作専用の透明 hit layer を React app shell または VRM scene root に用意する。
3. `OrbitControls` はその hit layer にだけ接続する。
4. chat / telop のような表示専用 overlay は `pointer-events: none` のまま、hit layer より上に表示できるようにする。
5. Debug Console / Settings / Header / right tool menu は hit layer より上に置き、`pointer-events: auto` の通常 UI として扱う。
6. UI コンポーネント側の wheel 手動スクロール、過剰な `stopPropagation`、details 専用の click 回避処理を必要最小限まで削る。
7. `VRMCamera` / `VRMScene` / initializer 間で `controlTarget` の意味が分かるように命名とコメントを整える。

## 実装対象候補

- `sincromisor-frontend/src/react/app-shell/SincroPageAppShell.tsx`
- `sincromisor-frontend/src/styles/simple.css`
- `sincromisor-frontend/src/styles/sincroCharacterBox.css`
- `sincromisor-frontend/src/ts/SincroVRM/SincroVRMInitializer.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMScene/VRMScene.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMScene/VRMCamera.ts`
- `sincromisor-frontend/src/react/overlay/RightToolFrame.tsx`
- `sincromisor-frontend/src/react/debug/DebugConsole.tsx`

## 完了条件

- Debug Console 内を wheel scroll してもキャラクターが zoom in/out しない。
- Settings panel 内を wheel scroll してもキャラクターが zoom in/out しない。
- Debug Console のタブ切り替え、`高度な調整` details 開閉、range / checkbox / select 操作が通常の React/DOM イベントとして動く。
- chat overlay の上では、表示専用領域を理由に OrbitControls 操作が不自然に遮られない。
- Header / right tool menu / close button のクリックが OrbitControls に干渉されない。
- UI 側のイベント遮断コードが、right tool frame の外側クリック閉じなど本当に必要な箇所に限定されている。
- `simple-vrm` の desktop / mobile でレイヤー重なりが破綻していない。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/simple-vrm/
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 確認観点

- 初回セットアップ後、右上ツールメニューから Debug Console を開ける。
- Debug Console の `Audio` タブへ切り替えられる。
- `高度な調整` を開閉できる。
- Debug Console 内の scroll 操作で `OrbitControls` の zoom が発生しない。
- Settings panel 内の scroll 操作で `OrbitControls` の zoom が発生しない。
- chat message 表示領域の上で、期待通りキャラクター操作ができる。
- キャラクター操作専用 hit layer の外側にある UI は、クリック・pointer・wheel を通常 UI として処理できる。
- backend 未起動に由来する `/api/v1/RTCSignalingServer/config.json` 404 や `getUserMedia` 権限エラーは、event / layer 判定対象外として扱う。

## 設計メモ

推奨レイヤー構成:

```text
z=10 Header / Debug Console / Settings / right tool menu  pointer-events: auto
z=5  Chat / Telop visual overlay                         pointer-events: none
z=3  OrbitControls hit layer                             pointer-events: auto
z=2  VRM canvas                                          drawing only
z=1  Background
```

`OrbitControls` は「ページ全体に効く global input」ではなく、「3D 操作 hit layer の controller」として扱う。UI 側は OrbitControls を止めるための防御コードを持たず、DOM の重なりと pointer-events によって入力責務を分ける。

## 実施メモ

- 2026-05-02 時点では、Debug Console の details 開閉と right tool frame の wheel 伝播に対する応急処置が入っている可能性がある。根本対応時に不要であれば撤去する。
- `LookingGlassXRController` には polyfill canvas 向けの pointer workaround があるため、本タスクでは simple-vrm の通常 `OrbitControls` 経路を先に整理し、Looking Glass 固有処理は影響確認に留める。
- 2026-05-02: `#sincroCharacterControlLayer` を追加し、`OrbitControls` の接続先を `div#sincroBody` から専用 input layer へ移した。Debug Console / Settings / Header / right tool menu は通常 UI layer として扱い、右側ツールの wheel 手動スクロールと Debug Console details の pointer 代替 toggle を撤去した。
- 2026-05-02: `npm run build` 成功。Playwright で simple-vrm desktop / mobile を確認し、Debug Console の Audio タブ切替、`高度な調整` details 開閉、Debug panel wheel が `#sincroCharacterControlLayer` に届かないこと、chat 表示領域越しに control layer が hit されることを確認した。backend 未起動の config 404 と media permission error は判定対象外。
