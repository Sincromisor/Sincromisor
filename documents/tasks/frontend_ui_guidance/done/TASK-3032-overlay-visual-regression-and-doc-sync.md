# TASK-3032 overlay visual regression 確認と設計同期

- 作成日: 2026-04-30
- ステータス: Done
- 優先度: Medium

## 目的

overlay chrome 共通化の結果を modern 3ページで確認し、`frontend_ui.md` と関連タスクへ実施結果を同期して `TASK-3027` epic を閉じられる状態にする。

## 背景

- overlay 共通化は shared shell / shared CSS に触れるため、`simple-vrm` だけでなく `vrm360` / `looking-glass-vrm` にも影響する。
- 起動前 dialog、右側設定パネル、Debug Console はそれぞれ表示タイミングとスクロール条件が異なるため、ビルド成功だけでは UI 不整合を検出しにくい。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3027-overlay-chrome-commonization-epic.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3028-overlay-close-button-and-token-consolidation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3029-right-tool-frame-unification.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3030-startup-dialog-frame-and-legacy-css-reduction.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3031-settings-form-primitives-and-inline-style-reduction.md`

## 先行条件

- `TASK-3028` から `TASK-3031` までの実装タスクが完了していること。

## スコープ

- build 確認
- Playwright または手動による overlay 表示確認
- desktop / mobile 幅での screenshot 確認
- 設計文書とタスク実施メモの同期
- `TASK-3027` epic の完了判定

## 非対象

- 新たな component 追加
- UI redesign の追加要求
- WebRTC 接続や音声入出力の実機検証

## 実装タスク

1. `cd sincromisor-frontend && npm run build` を実行する。
2. `simple-vrm` の desktop / mobile で起動前 dialog、右側設定パネル、Debug Console を確認する。
3. `vrm360` と `looking-glass-vrm` の desktop で右側ツール領域と起動前 dialog の明確な崩れがないことを確認する。
4. close button の位置、focus-visible、外側クリック閉じ、scrollbar、panel max-height を確認する。
5. `documents/design/frontend_ui.md` の共通化方針を実装後の実態へ更新する。
6. `TASK-3027` と各サブタスクの実施メモに確認結果を残し、完了したタスクを `done/` へ移動する。

## 想定変更箇所

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/open/*.md`
- 必要に応じて `documents/tasks/frontend_ui_guidance/done/*.md`

## 完了条件

- build が成功している
- modern 3ページで overlay chrome 共通化由来の明確な崩れがない
- 起動前 dialog / 右側設定パネル / Debug Console の close button と surface が同じ visual family に見える
- 設計文書が実装後の責務境界を反映している
- `TASK-3027` epic を close できる判断材料が揃っている

## 確認

- `cd sincromisor-frontend && npm run build`
- Playwright またはブラウザで `simple-vrm` / `vrm360` / `looking-glass-vrm` を確認する

## 実施メモ

- backend 未起動で `/api/v1/RTCSignalingServer/config.json` が失敗する場合でも、overlay layout 確認として支障がない範囲ならその旨を記録して進める。
- 2026-05-01: `cd sincromisor-frontend && npm run build` 成功。Vite は 500 kB 超 chunk の warning を出したが、TypeScript / production build は完了した。
- 2026-05-01: Vite dev server は `127.0.0.1:5173` が使用中だったため `http://127.0.0.1:5174/` で起動した。
- 2026-05-01: Playwright で `simple-vrm` desktop / mobile を確認。起動前 dialog、右側設定パネル、Debug Console の surface、close button、scroll、max-height、外側クリック閉じ、focus-visible に明確な崩れはなかった。
- 2026-05-01: Playwright で `vrm360` / `looking-glass-vrm` desktop を確認。起動前 dialog、右側設定パネル、Debug Console の右側ツール frame に overlay 共通化由来の明確な崩れはなかった。
- 2026-05-01: backend 未起動のため `/api/v1/RTCSignalingServer/config.json` は 404、ブラウザ権限未付与のため `getUserMedia` は `NotAllowedError` になった。どちらも WebRTC / 実機検証の非対象条件として扱い、overlay layout regression の blocker ではない。
- 2026-05-01: `documents/design/frontend_ui.md` に実装後の責務境界と visual regression 確認結果を追記した。
- 2026-05-01: `TASK-3027` epic は close 可能と判断した。
