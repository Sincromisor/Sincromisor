# TASK-3030 StartupDialogFrame と legacy dialog CSS 縮退

- 作成日: 2026-04-30
- ステータス: Done
- 優先度: Medium

## 目的

起動前 dialog の native `<dialog>` 境界を維持しながら、surface / backdrop / padding / scroll などの外側 chrome を `StartupDialogFrame` 相当へ整理し、`sincroConfigurationDialog.css` の modern 見た目責務を縮退する。

## 背景

- `ConfigurationDialog` は React root と native dialog の同期を担うが、外側 chrome は `configurationDialogSettings.css` と `sincroConfigurationDialog.css` の双方に痕跡がある。
- `TASK-3010` で legacy layer と modern component CSS の境界は整理されたが、modern ページの HTML はまだ `sincroConfigurationDialog.css` を読み込んでいる。
- 起動前 dialog は右側ツールと表示形式が異なるため、`RightToolFrame` と完全共通ではなく、native dialog 用 frame として整理する。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3027-overlay-chrome-commonization-epic.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3010-css-foundation-and-legacy-style-isolation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3016-full-react-startup-dialog-and-bridge-dom-removal.md`

## 先行条件

- `TASK-3028` で overlay CSS の置き場所が作られていること。

## スコープ

- `StartupDialogFrame` component の追加
- `ConfigurationDialog` の frame 構造整理
- `configurationDialogSettings.css` の surface / backdrop / scroll 責務の見直し
- `sincroConfigurationDialog.css` の legacy fallback 縮退
- modern 3ページから legacy dialog CSS 読み込みを外せるかの判断

## 非対象

- 起動前設定のカテゴリ構成や文言の再設計
- `DialogManager` / `DialogStateStore` の状態管理変更
- native `<dialog>` を廃止して custom modal に置き換えること

## 実装タスク

1. `src/react/overlay/StartupDialogFrame.tsx` を追加し、dialog 内 frame、pop layer、settings root の責務を整理する。
2. `ConfigurationDialog.tsx` で native `<dialog>` と frame component の境界を明確にする。
3. `configurationDialogSettings.css` の generic surface / backdrop / scrollbar 指定を overlay CSS へ寄せ、dialog 固有 override に縮退する。
4. `sincroConfigurationDialog.css` が modern React dialog の見た目を上書きしないことを確認する。
5. modern 3ページで `sincroConfigurationDialog.css` の読み込みを外せる場合は外す。外せない場合は理由を実施メモに残す。

## 想定変更箇所

- `sincromisor-frontend/src/react/overlay/StartupDialogFrame.tsx`
- `sincromisor-frontend/src/react/overlay/overlay.css`
- `sincromisor-frontend/src/react/dialog/ConfigurationDialog.tsx`
- `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`
- `sincromisor-frontend/src/styles/sincroConfigurationDialog.css`
- `sincromisor-frontend/src/simple-vrm/index.html`
- `sincromisor-frontend/src/vrm360/index.html`
- `sincromisor-frontend/src/looking-glass-vrm/index.html`

## 完了条件

- 起動前 dialog の surface / backdrop / scroll の主要指定が overlay frame 側で説明できる
- `sincroConfigurationDialog.css` が legacy fallback と互換維持に限定されている
- Esc / backdrop click 抑止など native dialog の platform behavior が維持されている
- 起動前 dialog が desktop / mobile で既存の情報設計を保って表示される

## 確認

- `cd sincromisor-frontend && npm run build`
- 起動前 dialog の表示、開始ボタン、トップへ戻る、Esc / backdrop click 抑止を確認する
- `simple-vrm` / `vrm360` / `looking-glass-vrm` で dialog 表示に差分がないことを確認する

## 実施メモ

- `DialogBridgeDomAdapter` の責務は native dialog API と close-interaction 抑止に限定し、見た目調整を戻さない。
- 2026-04-30: `StartupDialogFrame` を追加し、native `<dialog>` は `ConfigurationDialog`、dialog surface / backdrop / padding / scroll / pop layer / settings root は `src/react/overlay/overlay.css` + `StartupDialogFrame` 側へ整理した。
- 2026-04-30: `configurationDialogSettings.css` は設定フォーム本体、SettingsShell override、footer/category 等に縮退した。
- 2026-04-30: `sincroConfigurationDialog.css` は `dialog#configurationDialog:not(:has(.startupDialogFrame))` の legacy fallback に限定し、modern 3ページの HTML から読み込みを削除した。
- 2026-04-30: `npm run build` 成功。Vite dev server（`http://127.0.0.1:5174/`）で `simple-vrm` / `vrm360` / `looking-glass-vrm` の dialog 表示、開始ボタンの有効状態、Esc / backdrop click 抑止を確認した。dev server 単体では backend 未起動のため `/api/v1/RTCSignalingServer/config.json` は 404 になる。
- 2026-05-01: `TASK-3032` の Playwright 確認で、`simple-vrm` mobile と modern 3ページ desktop の起動前 dialog surface / backdrop / responsive scroll に明確な崩れがないことを確認した。
