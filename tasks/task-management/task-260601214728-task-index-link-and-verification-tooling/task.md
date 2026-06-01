# TASK-260601214728 task index link and verification tooling

## 目的

新しい `tasks/` レイアウトで、index 生成、リンク修正、CI / 手元確認に使える検証手順を整える。

## 親タスク

- `TASK-260601214723`

## 依存

- `TASK-260601214724`
- `TASK-260601214726`

## 変更範囲

- `scripts/tasks/genIndex.mjs`
- `scripts/tasks/fixLinks.mjs`
- 必要に応じて `scripts/tasks/checkTasks.mjs`
- `tasks/README.md`
- 生成される `tasks/<category>/index.md`
- `sincromisor-frontend/package.json` の Markdown check / format 対象

## 実装方針

- `tasks:index` はカテゴリ別 index を `meta.yaml` から再生成する。
- `tasks:index:check` は CI または手元確認で差分があれば失敗する。
- `tasks:fixlinks` は旧 `documents/tasks` 参照と新 `tasks` 参照の壊れリンクを検出し、dry-run / apply を分ける。
- Markdown formatter / checker は新しい `tasks/**/*.md` を対象に含め、`documents/**/*.md` だけを正本対象にしない。
- 必要であれば `tasks:check` を追加し、次を検証する。
    - `meta.yaml` とディレクトリ名の一致
    - `task.md` の存在
    - `status`, `review`, `verdict` の許容値
    - `done` と `verdict=PASS` の整合
    - `superseded` と `superseded_by` の整合

## 完了条件

- 全カテゴリの index が生成されている。
- index 生成が冪等である。
- 壊れた相対リンクの検出と修正候補表示ができる。
- 新タスク構造の基本的な整合性をコマンドで確認できる。
- `check:md` / `format:md` または後継コマンドが `tasks/` 配下の Markdown を対象にしている。

## 確認

- [x] `tasks:index` を 2 回実行して 2 回目に差分が出ないことを確認する。
- [x] `tasks:index:check` が通る。
- [x] `tasks:fixlinks` dry-run の結果を確認する。
- [x] 可能なら `tasks:check` を追加し、移行後の全 task directory に対して実行する。
- [x] `npm run check:md` または同等のコマンドで、`tasks/` 配下の Markdown が対象になることを確認する。

## 結果

- `scripts/tasks/checkTasks.mjs` を追加し、task directory と `meta.yaml` の基本整合性を確認できるようにした。
- `npm run tasks:check` を追加し、`tasks/README.md` に運用コマンドとして記載した。
- `tasks:index` の冪等性、`tasks:index:check`、`tasks:fixlinks` dry-run、`tasks:check`、`npm run check:md` を確認した。
