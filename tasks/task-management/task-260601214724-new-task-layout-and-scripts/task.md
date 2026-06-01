# TASK-260601214724 new task layout and scripts

## 目的

`~/projects/run-task-agents` のタスク管理スクリプトを Sincromisor 向けに取り込み、新しい `tasks/` レイアウトを導入する。

## 親タスク

- `TASK-260601214723`

## 変更範囲

- `tasks/README.md` を作成し、Sincromisor のタスク管理正本を `documents/tasks/README.md` から移す。
- `scripts/tasks/` に `newTask.mjs`, `setMeta.mjs`, `genIndex.mjs`, `fixLinks.mjs` を導入する。
- 必要に応じてルート `package.json` を追加し、タスク操作用 npm scripts を定義する。
- `meta.yaml` の項目を Sincromisor 向けに確定する。
- 新規タスク用テンプレートに、設計同期、確認、実行できなかった検証、subagent 成果物の扱いを含める。
- Markdown formatter / checker の対象に新しい `tasks/**/*.md` を含める方針を定義する。

## 実装方針

- `run-task-agents` のスクリプトをベースにするが、Sincromisor 固有の命名と検証コマンドに合わせて文言を調整する。
- タスク状態は物理ディレクトリ `open/` / `done/` ではなく、`meta.yaml` の `status` に集約する。
- `status` は `open`, `blocked`, `done`, `cancelled`, `superseded` を基本とする。
- `review` と `verdict` は `status` とは分け、二重管理を避ける。
- canonical ID はディレクトリ名と一致する `task-<id>-<slug>` とする。
- 旧 `TASK-xxxx` 参照は移行互換のため `meta.yaml` の `legacy_ids` または `aliases` に保持し、TODO / コミットメッセージ / 設計履歴で許容する表記を `tasks/README.md` に明記する。

## 完了条件

- `tasks/README.md` が新レイアウトの正本として読める。
- `node scripts/tasks/newTask.mjs <category> "<title>"` または `npm run tasks:new -- <category> "<title>"` でタスクを作成できる。
- `tasks:set` で `status`, `review`, `verdict`, `attempts`, `depends_on`, `superseded_by` を更新できる。
- `tasks:index` でカテゴリ別 `index.md` を生成できる。
- 生成される task directory が Codex subagent パイプラインの成果物置き場を含む。
- `sincromisor-frontend/package.json` の `check:md` / `format:md`、または後継の Markdown 確認コマンドが `../tasks/**/*.md` を対象に含んでいる。

## 確認

- [x] `tasks:new` の生成結果を確認する。
- [x] `tasks:set` で `status=blocked` から `status=open`、`status=done verdict=PASS` への更新を確認する。
- [x] `tasks:index` と `tasks:index:check` を実行する。
- [x] 生成ファイルが Markdown / YAML として読みやすいことを確認する。
- [x] `npm run check:md` または同等の Markdown check が `tasks/` 配下も確認することを検証する。

## 結果

- `tasks/README.md` を新タスク管理の正本として追加した。
- `package.json` に `tasks:new`, `tasks:set`, `tasks:index`, `tasks:index:check`, `tasks:fixlinks` を追加した。
- `scripts/tasks/` に `newTask.mjs`, `setMeta.mjs`, `genIndex.mjs`, `fixLinks.mjs`, `lib.mjs` を追加した。
- `sincromisor-frontend/package.json` の Markdown check / format 対象に `../tasks/**/*.md` を追加した。
- 一時ルート `/private/tmp/sincromisor-task-script-check` で `newTask`, `setMeta`, `genIndex`, `genIndex --check`, `fixLinks` dry-run を確認した。
- ルートで `npm run tasks:index`、フロントで `npm run check:md` を実行し、成功を確認した。
