# TASK-3025 main content 設計同期と shared ページ確認

- 作成日: 2026-04-24
- ステータス: Done
- 優先度: Medium

## 目的

`TASK-3020` から `TASK-3024` までの結果を `frontend_ui.md` へ同期し、shared CSS / shell 変更が `vrm360` / `looking-glass-vrm` を壊していないことを確認する。

## 背景

- 今回の refine は `simple-vrm` を主対象にするが、shared shell や shared CSS を触るため、実際の影響は modern 3 ページへ広がる。
- また、main content の visual 方針を更新した以上、設計文書を最後に current state へそろえる必要がある。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3019-simple-vrm-main-content-visual-refine-epic.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3020-modern-pages-viewport-and-responsive-prerequisites.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3021-main-content-legacy-global-style-isolation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3022-simple-vrm-header-and-tool-chrome-visual-alignment.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3023-simple-vrm-chat-overlay-redesign.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3024-simple-vrm-telop-footer-overlay-redesign.md`

## スコープ

- main content visual 方針の設計文書同期
- responsive 前提の設計文書同期
- `vrm360` / `looking-glass-vrm` の shared 変更影響確認
- build / 主要画面の最終確認

## 非対象

- 新たな visual redesign
- ページ固有 UI の追加改善

## 実装タスク

1. `frontend_ui.md` の main content visual 方針、responsive 前提、必要に応じた CSS 責務整理を最終状態へ同期する。
2. `simple-vrm` の desktop / mobile 相当幅確認を行い、header / chat / telop の一体感を最終確認する。
3. `vrm360` / `looking-glass-vrm` の shared 部分に明確な崩れがないことを確認する。
4. 実施結果を task / design doc の記録へ残す。

## 想定変更箇所

- `documents/design/frontend_ui.md`
- 必要に応じて各タスク文書の実施メモ

## 完了条件

- `frontend_ui.md` が実装後の main content 方針を反映している
- `simple-vrm` の確認結果が整理されている
- `vrm360` / `looking-glass-vrm` に shared 変更由来の明確な崩れがない
- `TASK-3019` epic を閉じられる状態になっている

## 確認

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` / `vrm360` / `looking-glass-vrm` の主要画面確認

## 実施メモ

- 文書更新は親タスクではなく、この収束タスクでまとめて行う前提とする。
- 実施結果:
    - `documents/design/frontend_ui.md` に main content の dark / immersive visual 方針、overlay 設計、responsive 前提、legacy global reset の責務整理を同期した。
    - `cd sincromisor-frontend && npm run build` は 2026-04-24 に成功した。
    - Playwright + `vite preview` で `simple-vrm` を desktop `1280x720`、mobile `390x844` で確認し、header / chat / telop overlay が狭幅でも scene を過度に塞がないことを確認した。
    - preview 環境では backend 未起動のため `/api/v1/RTCSignalingServer/config.json` の 404 が出るが、shared shell / CSS 確認の支障にはならないため sample chat / telop を注入して layout を検証した。
    - `vrm360` と `looking-glass-vrm` も desktop `1280x720` で確認し、header / footer overlay の配置と寸法が `simple-vrm` と同等で、shared 変更由来の明確な崩れは確認されなかった。
    - 親タスク `TASK-3019` の完了条件を満たしたため、本タスクと合わせて close した。
