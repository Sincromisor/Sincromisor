# TASK-3027 overlay chrome 共通化 epic

- 作成日: 2026-04-30
- ステータス: Done
- 優先度: High

## 目的

起動前 dialog、右側設定パネル、Debug Console の外側 chrome（surface、close button、z-index、幅、高さ、scroll、backdrop）を段階的に共通化し、UI 不整合を個別 CSS 調整で直し続ける状態を解消する。

## 背景

- `64436a7 Align right tool close buttons` では、右側設定パネルと Debug Console の閉じるボタンを揃えるために、`DebugConsole.tsx`、`RightToolSettingsChrome.tsx`、`sincroDebugConsole.css` を個別に修正した。
- 症状としては閉じるボタン位置の不整合だったが、根本原因は `OverlayFrame` / `RightToolFrame` 相当の共通コンポーネントがなく、各 UI が外側 chrome と content を同時に所有していることにある。
- `SettingsShell` はカテゴリナビと設定詳細ペインの共通化には効いているが、overlay surface や close button の責務は持たないため、別の共通化レイヤが必要である。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3010-css-foundation-and-legacy-style-isolation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3015-debug-console-react-migration-and-diagnostics-core-split.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3016-full-react-startup-dialog-and-bridge-dom-removal.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3017-ui-manager-layer-reduction-and-app-service-consolidation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3022-simple-vrm-header-and-tool-chrome-visual-alignment.md`

## スコープ

- 起動前 dialog / 右側設定パネル / Debug Console の外側 chrome の棚卸し
- close button、surface、scrollbar、panel sizing、z-index、backdrop の共通化
- `sincroDebugConsole.css` と `configurationDialogSettings.css` の責務縮退
- visual regression 確認と設計文書同期

## 非対象

- Debug Console の診断情報設計の再編
- 設定カテゴリや設定項目そのものの再設計
- WebRTC / 音声処理 / CharacterGaze の挙動変更
- トップページや main content の新規 redesign

## サブタスク

1. `TASK-3028-overlay-close-button-and-token-consolidation`
   - close button と最小 token を共通化する。
2. `TASK-3029-right-tool-frame-unification`
   - 右側設定パネルと Debug Console の外側 frame を統一する。
3. `TASK-3030-startup-dialog-frame-and-legacy-css-reduction`
   - 起動前 dialog の frame を整理し、legacy dialog CSS の責務を縮退する。
4. `TASK-3031-settings-form-primitives-and-inline-style-reduction`
   - 設定フォーム内の button / field / toggle / help / section card を共通 primitive へ寄せる。
5. `TASK-3032-overlay-visual-regression-and-doc-sync`
   - modern 3ページの overlay 表示確認、設計文書同期、epic close 判定を行う。

## 完了条件

- 右側設定パネルと Debug Console の close button / panel surface / sizing / scroll が共通 frame 由来になっている
- 起動前 dialog の modern 見た目責務が legacy CSS から分離されている
- overlay chrome の新規調整先が `src/react/overlay/*` など明確な場所にまとまっている
- `sincroDebugConsole.css` が Debug Console content と右上 menu 固有の見た目中心に縮退している
- `simple-vrm` / `vrm360` / `looking-glass-vrm` で desktop / mobile の明確な崩れがない

## 確認

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` / `vrm360` / `looking-glass-vrm` の右側設定パネル、Debug Console、起動前 dialog を確認する
- 必要に応じて Playwright で desktop / mobile のスクリーンショットを保存し、close button と panel surface の位置を確認する

## 実施メモ

- 本 epic は調査と実装を混ぜず、実装はサブタスク単位でコミットする。
- 既存 DOM id は legacy / manager 互換のため維持し、見た目責務の移動を優先する。
- 2026-05-01: `TASK-3028` から `TASK-3031` までの実装タスクは `done/` に移動済みであることを確認した。
- 2026-05-01: `TASK-3032` で `npm run build` と Playwright による modern 3ページの overlay visual regression 確認を実施した。`simple-vrm` desktop / mobile、`vrm360` desktop、`looking-glass-vrm` desktop で、起動前 dialog、右側設定パネル、Debug Console の共通 chrome に明確な崩れはなかった。
- 2026-05-01: `src/react/overlay/OverlayCloseButton.tsx`、`RightToolFrame.tsx`、`StartupDialogFrame.tsx`、`overlay.css` が overlay chrome の主要調整先になっている。`SettingsShell` と Debug Console content CSS へ frame 責務を戻さない方針を `documents/design/frontend_ui.md` に反映した。
- 2026-05-01: backend 未起動の `/api/v1/RTCSignalingServer/config.json` 404 とブラウザ権限未付与の `NotAllowedError` は、今回の overlay regression 判定対象外として記録した。
- 2026-05-01: epic 完了条件を満たしたため Done とする。
