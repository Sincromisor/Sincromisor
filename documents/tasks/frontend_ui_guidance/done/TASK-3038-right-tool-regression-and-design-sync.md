# TASK-3038 右側ツールUI回帰確認と設計文書同期

- 作成日: 2026-05-01
- ステータス: Done
- 優先度: Medium
- 親タスク: `TASK-3033`
- 依存: `TASK-3034`, `TASK-3035`, `TASK-3036`, `TASK-3037`

## 目的

右側ツールUI refine の実装結果を Playwright と build で確認し、必要な設計判断を `documents/design/frontend_ui.md` に同期する。

## 背景

- 右側ツール領域は `simple-vrm` だけでなく `vrm360` / `looking-glass-vrm` でも共有される。
- `RightToolFrame`、`SettingsShell`、Debug Console CSS にまたがる調整は、単体では問題なく見えても shared shell へ副作用が出やすい。
- 実装タスクごとの確認に加えて、最後に cross-page の確認と設計文書更新をまとめる必要がある。

## スコープ

- `npm run build`
- `simple-vrm` desktop / mobile の Playwright 確認
- `vrm360` / `looking-glass-vrm` desktop の Playwright 確認
- `documents/design/frontend_ui.md` の更新
- 完了タスクへの確認結果記録

## 非対象

- 新規 redesign の追加実装
- 右側ツール以外の main content visual 調整
- backend 起動を前提にした WebRTC 実接続確認

## 実装タスク

1. `cd sincromisor-frontend && npm run build` を実行する。
2. `simple-vrm` desktop `1280x720` で、右上メニュー、設定パネル、Debug Console、設定から診断への切替、外側クリック close を確認する。
3. `simple-vrm` mobile `390x844` で、右上メニュー、設定パネル、Debug Console を確認する。
4. `vrm360` / `looking-glass-vrm` desktop `1280x720` で、右上メニューと右側ツール領域に明確な崩れがないことを確認する。
5. backend 未起動に由来する `/api/v1/RTCSignalingServer/config.json` 404 や permission error は、UI layout 判定対象外として記録する。
6. `documents/design/frontend_ui.md` に、右上ツール switcher、設定から診断への handoff、compact navigation の最終方針を同期する。
7. 分割タスクの実施メモへ確認結果を追記し、完了条件を満たすものを `done/` へ移動する。

## 完了条件

- build が成功している。
- `simple-vrm` desktop / mobile で、右側ツールUIの主要導線が崩れず動作する。
- `vrm360` / `looking-glass-vrm` desktop で shared shell 由来の明確な崩れがない。
- `documents/design/frontend_ui.md` が実装後の方針と一致している。
- `TASK-3033` から `TASK-3038` までの状態が整理されている。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
playwright-cli open http://127.0.0.1:5173/simple-vrm/
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 実施メモ

- 確認日時: 2026-05-01
- `cd sincromisor-frontend && npm run build` は成功した。Vite の chunk size warning は既存 bundle size 注意であり、右側ツールUI回帰ではない。
- `simple-vrm` desktop `1280x720` で、右上ツールメニュー、設定パネル、Debug Console、設定 `接続` ページから `詳しい診断を開く` への handoff、外側クリック close を確認した。設定パネルと Debug Console は同時表示されず、menu active state も `設定` / `診断` に追従した。
- `simple-vrm` mobile `390x844` で、右上メニューは icon button に縮退し、設定パネルはカテゴリ select、Debug Console は header / tabs / 停止ボタンが重ならず表示されることを確認した。
- `vrm360` desktop `1280x720` で、右上メニュー、設定パネル、Debug Console を確認した。VR 非対応表示は出るが、右側ツール領域の崩れはない。
- `looking-glass-vrm` desktop `1280x720` で、右上メニュー、Looking Glass カテゴリを含む設定パネル、Debug Console を確認した。ページ固有カテゴリと通常カテゴリの混在による崩れはない。
- backend 未起動のため `/api/v1/RTCSignalingServer/config.json` は 404、ブラウザ権限未付与のため `getUserMedia` は `NotAllowedError` になった。どちらも今回の UI layout 判定対象外として記録する。
- `documents/design/frontend_ui.md` は、右上ツール switcher、設定から診断への handoff、compact navigation、cross-page regression の最終方針と一致していることを確認した。
