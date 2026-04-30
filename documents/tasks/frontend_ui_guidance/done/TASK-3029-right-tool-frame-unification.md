# TASK-3029 RightToolFrame による右側ツール領域統一

- 作成日: 2026-04-30
- ステータス: Done
- 優先度: High

## 目的

右側設定パネルと Debug Console の外側 frame を `RightToolFrame` 相当の共通コンポーネントへ統一し、panel の位置、幅、z-index、scroll、close chrome を一箇所で管理できるようにする。

## 背景

- 現状は `sincroDebugConsoleContainer` と `sincroReactSettingsPanelContainer` が別々の fixed container と z-index を持ち、content 側 CSS が panel surface や scroll を所有している。
- `RightToolMenu` は相互排他表示と外側クリック閉じを担当しているが、外側 frame の DOM 構造は共通化していない。
- `SettingsShell` は中身の共通化であり、右側 overlay としての位置・面・閉じる導線を持たせるべきではない。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3027-overlay-chrome-commonization-epic.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3028-overlay-close-button-and-token-consolidation.md`

## 先行条件

- `TASK-3028` で `OverlayCloseButton` が導入されていること。

## スコープ

- `RightToolFrame` component の追加
- 右側設定パネルと Debug Console の外側 frame 統一
- `SincroPageAppShell` の右側ツール DOM 整理
- `sincroDebugConsole.css` の panel frame 責務縮退

## 非対象

- 起動前 dialog の native `<dialog>` 整理
- Debug Console のカードやタブの内部 layout 変更
- 設定カテゴリの再構成

## 実装タスク

1. `src/react/overlay/RightToolFrame.tsx` を追加し、`id`、`isOpen`、`title/ariaLabel`、`onClose`、`variant`、`children` を受ける。
2. `RightToolFrame` で右側 overlay の位置、幅、max-height、pointer-events、scroll container、close button slot を統一する。
3. `SincroPageAppShell.tsx` の `sincroDebugConsoleContainer` / `sincroReactSettingsPanelContainer` を frame component 利用へ寄せる。
4. `RightToolMenu` の visibility 同期が新しい DOM 構造でも既存 state と整合するよう調整する。
5. `sincroDebugConsole.css` から右側設定パネルの外側 frame と Debug Console frame の重複指定を削減する。

## 想定変更箇所

- `sincromisor-frontend/src/react/overlay/RightToolFrame.tsx`
- `sincromisor-frontend/src/react/overlay/overlay.css`
- `sincromisor-frontend/src/react/app-shell/SincroPageAppShell.tsx`
- `sincromisor-frontend/src/react/debug/RightToolMenu.tsx`
- `sincromisor-frontend/src/react/debug/DebugConsole.tsx`
- `sincromisor-frontend/src/styles/sincroDebugConsole.css`

## 完了条件

- 右側設定パネルと Debug Console の外側 frame が同一 component から描画されている
- 設定パネルと Debug Console が同時表示されない
- 外側クリック閉じ、close button、`Ctrl+Alt+D` の既存操作が維持されている
- desktop / mobile 幅で panel が画面外へはみ出さない

## 確認

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` で設定パネルと Debug Console の開閉、相互切替、外側クリック閉じを確認する
- `vrm360` / `looking-glass-vrm` でも右側ツール領域が表示できることを確認する

## 実施メモ

- 既存 id は manager / test / CSS 互換を壊さない範囲で維持する。
- content 側の見た目変更は最小化し、frame 責務の移動を主目的にする。
- 2026-04-30: `RightToolFrame` を追加し、設定パネルと Debug Console の fixed layer / surface / scroll / close button slot / 外側クリック閉じを共通化した。
- 2026-04-30: `simple-vrm` で設定パネルと Debug Console の相互切替、外側クリック閉じ、desktop / mobile 幅の収まりを確認した。`vrm360` / `looking-glass-vrm` でも右側ツールメニューと設定パネル表示を確認した。
