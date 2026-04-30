# TASK-3028 overlay close button と token の共通化

- 作成日: 2026-04-30
- ステータス: Done
- 優先度: High

## 目的

右側設定パネルと Debug Console で個別に扱っている閉じるボタンの DOM / CSS を `OverlayCloseButton` 相当の共通コンポーネントへ切り出し、今後の位置・サイズ・focus 表現の不整合を防ぐ。

## 背景

- `64436a7` では `button.rightToolCloseButton` を導入して見た目を寄せたが、CSS は `sincroDebugConsole.css` 内にあり、Debug Console 固有の変数や selector と混在している。
- `RightToolSettingsChrome.tsx` は close button だけの小さな wrapper になっており、共通 component に置き換えやすい。
- close button は overlay chrome の最小共通化単位としてリスクが低く、後続の `RightToolFrame` 導入前に先行できる。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3027-overlay-chrome-commonization-epic.md`

## スコープ

- `OverlayCloseButton` component の追加
- `overlay.css` など共通 CSS の追加
- `debugConsoleClose` と `reactSettingsPanelClose` の共通 component 化
- close button 用 token / custom property の整理

## 非対象

- 右側ツール領域全体の frame 統一
- 起動前 dialog の frame 変更
- Debug Console の header 情報設計変更

## 実装タスク

1. `src/react/overlay/OverlayCloseButton.tsx` を追加し、ARIA label、icon、className 拡張、onClick を props で受ける。
2. `src/react/overlay/overlay.css` を追加し、close button のサイズ、色、focus-visible、hover、disabled を token ベースで定義する。
3. `DebugConsole.tsx` と `RightToolSettingsChrome.tsx` の inline SVG close button を `OverlayCloseButton` へ置き換える。
4. `sincroDebugConsole.css` から `button.rightToolCloseButton` の汎用見た目を overlay CSS へ移す。
5. 既存 id（`debugConsoleClose`, `reactSettingsPanelClose`）は互換のため維持する。

## 想定変更箇所

- `sincromisor-frontend/src/react/overlay/OverlayCloseButton.tsx`
- `sincromisor-frontend/src/react/overlay/overlay.css`
- `sincromisor-frontend/src/react/debug/DebugConsole.tsx`
- `sincromisor-frontend/src/react/debug/RightToolSettingsChrome.tsx`
- `sincromisor-frontend/src/styles/sincroDebugConsole.css`

## 完了条件

- 右側設定パネルと Debug Console が同じ close button component を使っている
- close button の汎用 CSS が `sincroDebugConsole.css` から分離されている
- focus-visible が視認でき、キーボード操作時に outline が消えない
- 既存の開閉操作 API と DOM id 互換が維持されている

## 確認

- `cd sincromisor-frontend && npm run build`
- 右側設定パネルと Debug Console を開き、close button の hover / focus / click を確認する

## 実施メモ

- このタスクでは配置の大幅変更は行わず、既存位置指定を保ったまま component と CSS の責務移動を優先する。
- 2026-04-30: `OverlayCloseButton` と `overlay.css` を追加し、Debug Console / 右側設定パネルの閉じるボタンを共通 component 化した。
- 2026-04-30: `debugConsoleClose` と `reactSettingsPanelClose` の DOM id は維持した。
- 2026-04-30: `npm run build` で TypeScript / Vite build が成功することを確認した。
- 2026-05-01: `TASK-3032` の Playwright 確認で、設定パネル / Debug Console の close button 位置、click close、focus-visible が `simple-vrm` desktop / mobile と `vrm360` / `looking-glass-vrm` desktop で明確に崩れていないことを確認した。
