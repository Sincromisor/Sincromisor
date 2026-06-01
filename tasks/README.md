# タスク管理

この文書は、Sincromisor のタスク管理、Codex subagent 成果物、検証ログ、コミット単位の運用正本である。

## 基本方針

- タスクは 1 タスク = 1 ディレクトリで管理する。
- 作業状態は物理ディレクトリではなく `meta.yaml` の `status` を正本にする。
- 設計の現在仕様は `documents/design/` に置き、作業ログを設計本文へ溜め込まない。
- 実装、設定、compose、設計文書は必要に応じて同じタスク内で同期する。
- 実行した確認、実行できなかった確認、残リスクは `impl.md` または `eval.md` に残す。
- 最低限、1 タスク 1 コミットを基本とする。コミットメッセージには関連する task ID または legacy `TASK-...` ID を含める。

## レイアウト

```text
tasks/<category>/
  task-<id>-<slug>/
    task.md
    meta.yaml
    review.md
    impl.md
    eval.md
    acceptance/
    artifacts/
  index.md
```

- `<category>` は責務が分かる kebab-case とする。
- `<id>` は新規タスクでは `%y%m%d%H%M%S` を使う。移行タスクでは `1006` など既存 ID を保持してよい。
- `<slug>` は英数字とハイフンで書く。
- canonical ID はディレクトリ名と一致する `task-<id>-<slug>` とする。
- `index.md` は `tasks:index` が自動生成する。手書き前文は残せるが、AUTOGEN ブロック内は編集しない。

## ファイルの役割

| ファイル      | 書き手                | 役割                                                    |
| ------------- | --------------------- | ------------------------------------------------------- |
| `task.md`     | 起票者 / parent Codex | タスク仕様、変更範囲、受け入れ条件。review 後は原則固定 |
| `meta.yaml`   | parent Codex          | 状態メタデータの正本。`tasks:set` で更新                |
| `review.md`   | reviewer subagent     | 実装前レビュー、承認可否、リスク、確認観点              |
| `impl.md`     | implementer subagent  | 実装ログ、変更内容、確認結果、実行できなかった検証      |
| `eval.md`     | evaluator subagent    | 独立評価、品質ゲート結果、PASS / FAIL                   |
| `acceptance/` | evaluator subagent    | 独立検証用の補助ファイル                                |
| `artifacts/`  | 各 role               | タスク固有のログ、CSV、スクリーンショット、調査メモ     |

## meta.yaml

```yaml
id: "task-260601153000-example"
title: "例タスク"
category: "task-management"
status: "open"
depends_on: []
superseded_by: null
review: null
verdict: null
attempts: 0
legacy_ids: []
created_at: "2026-06-01"
closed_at: null
```

`meta.yaml` は手で編集せず、原則として `tasks:set` で更新する。

### status

| status       | 意味                                           |
| ------------ | ---------------------------------------------- |
| `open`       | 未完。着手前、実装中、または FAIL 後の継続対象 |
| `blocked`    | 外部要因、依存、意思決定待ちで停止中           |
| `done`       | evaluator が PASS し close 済み                |
| `cancelled`  | 後継なしで取りやめ                             |
| `superseded` | 後継タスクに置き換え                           |

- 終端 status は `done`, `cancelled`, `superseded` とする。
- 終端 status に変更すると、`closed_at` が未指定なら当日で自動設定される。
- `review` は `APPROVED` または `NEEDS_REVISION`、`verdict` は `PASS` または `FAIL` とする。
- `review` と `verdict` は `status` と分け、二重管理を避ける。
- `superseded` では `superseded_by` に後継 task ID を入れる。

## legacy ID

旧 `documents/tasks` 由来の `TASK-...` ID は `legacy_ids` に保持する。コミットメッセージ、設計履歴、古い TODO では `TASK-...` 表記を許容するが、新規のタスク本文と相互参照では canonical ID を優先する。

TODO は新規コードでは `TODO(task-260601153000-example): ...` を推奨する。既存の `TODO(TASK-...)` は移行互換として残してよい。

旧 done タスクは正確な完了日が本文から機械的に取れないため、移行時の `closed_at` は `null` のまま保持する。新方式で close するタスクは `tasks:set status=done` が `closed_at` を設定する。

## スクリプト

ルートで実行する。

| コマンド                                                                    | 用途                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm run tasks:new -- <category> "<title>" [--slug=<slug>] [--depends=a,b]` | 新規タスクを作る                                          |
| `npm run tasks:set -- <task-dir> key=value ...`                             | `meta.yaml` を決定的に更新する                            |
| `npm run tasks:index`                                                       | カテゴリ別 `index.md` を生成する                          |
| `npm run tasks:index:check`                                                 | `index.md` が最新か検証する                               |
| `npm run tasks:check`                                                       | task directory と `meta.yaml` の整合性を検証する          |
| `npm run tasks:fixlinks`                                                    | 壊れた Markdown 相対リンクの修正候補を dry-run で表示する |
| `npm run tasks:fixlinks -- --apply`                                         | 修正候補を適用する                                        |
| `npm run tasks:migrate:legacy`                                              | 旧 `documents/tasks` レイアウトの移行計画を dry-run する  |
| `npm run tasks:migrate:legacy -- --apply`                                   | 旧 `documents/tasks` レイアウトを `tasks/` へ移行する     |

例:

```sh
npm run tasks:new -- task-management "Update task rules" -- --slug=update-task-rules
npm run tasks:set -- tasks/task-management/task-260601153000-update-task-rules review=APPROVED
npm run tasks:set -- tasks/task-management/task-260601153000-update-task-rules status=done verdict=PASS attempts=1
npm run tasks:index
npm run tasks:check
```

## Codex subagent パイプライン

subagent pipeline を明示して実行するタスクでは、parent Codex が reviewer -> implementer -> evaluator -> close を調停する。

Role 手順は Git 追跡対象の Codex skills として管理する。

- `.agents/skills/sincromisor-task-runner/SKILL.md`: parent Codex の orchestration
- `.agents/skills/task-reviewer/SKILL.md`: 実装前レビュー
- `.agents/skills/task-implementer/SKILL.md`: 実装、確認、実装コミット
- `.agents/skills/impl-evaluator/SKILL.md`: 独立評価

1. reviewer は `task.md`, `meta.yaml`, 関連設計、関連コードを読み、`review.md` だけを書く。
2. parent Codex は reviewer 判定を `tasks:set` で `meta.yaml` に転記する。
3. implementer は `task.md`, `review.md`, 必要に応じて前回 `eval.md` を読み、実装、テスト、`impl.md` 追記、実装コミットを行う。`meta.yaml` と `eval.md` は触らない。
4. evaluator は committed diff と成果物を独立検証し、`eval.md` と必要な `acceptance/` だけを書く。実装コードは変更しない。
5. FAIL の場合、parent Codex は `eval.md` の残課題を implementer に渡し、上限回数内で再実装を回す。
6. PASS の場合、parent Codex が `tasks:set status=done verdict=PASS attempts=<n>` と `tasks:index` を実行し、close commit を作る。

実装 commit には実装差分、テスト、`impl.md` を含める。close commit には `review.md`, `eval.md`, `acceptance/`, `meta.yaml`, `index.md` を含める。

## 確認コマンド

変更内容に応じて実行範囲を絞ってよい。実行できなかった確認は理由を記録する。

Frontend:

```sh
cd sincromisor-frontend
npm run build
npm run check
npm run test
```

Python:

```sh
uv run ruff check .
uv run ruff format --check .
uv run --group dev --group full ty check .
uv run pytest
```

Compose:

```sh
cp examples/compose.env .env
chmod 600 .env
docker compose --profile full up -d
```

Markdown:

```sh
cd sincromisor-frontend
npm run check:md
```
