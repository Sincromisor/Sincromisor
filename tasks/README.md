# タスク管理

この文書は、Sincromisor のタスク管理、Codex subagent 成果物、検証ログ、コミット単位の運用正本である。

## 基本方針

- タスクは 1 タスク = 1 ディレクトリで管理する。
- 作業状態は物理ディレクトリではなく `meta.yaml` の `status` を正本にする。
- 設計の現在仕様は `documents/design/` に置き、作業ログを設計本文へ溜め込まない。
- 実装、設定、compose、設計文書は必要に応じて同じタスク内で同期する。
- 実行した確認、実行できなかった確認、残リスクは `impl.md` または `eval.md` に残す。
- 通常 Codex 作業でも subagent 作業でも、作業完了時はユーザーに作業概要、結果、確認、
  未実行確認、特記事項を報告する。
- 最低限、1 タスク 1 コミットを基本とする。コミットメッセージは Conventional Commits ベースで書き、関連する task ID または legacy `TASK-...` ID を footer の `Refs:` に含める。

## コミットメッセージ

今後のコミットは [Conventional Commits 1.0.0](https://www.conventionalcommits.org/ja/v1.0.0/) をベースにする。過去コミットは履歴を書き換えず、新規コミットから適用する。

基本形:

```text
<type>(<scope>): <summary>

<body: 変更理由、主な変更、実行した確認、残リスク・未確認事項>

Refs: task-260601153000-example
```

- `type` は英語小文字で書く。`summary` は日本語でも英語でもよい。
- `scope` は任意だが、履歴検索のため原則付ける。
- 関連タスクは footer の `Refs:` に canonical task ID を書く。legacy タスクの場合は `Refs: TASK-...` も許容する。
- subject は変更内容を表す。task ID だけ、または `Implement ...` だけの subject は避ける。
- タスクに紐づく commit の body には、実装、文書、close、生成 index 更新を問わず、変更理由、主な変更、実行した確認、残リスク・未確認事項が後から追えるだけの情報を書く。
- `Why:` / `What:` / `Verify:` / `Risk:` は推奨テンプレートとする。小さな変更では自然文や短い箇条書きでもよいが、上記 4 点の情報を欠落させない。
- 該当事項がない場合も、`Verify: 未実行 (理由)`、`Risk: なし`、または同等の自然文で明示する。
- `Verify:` ラベルを使う場合は 1 commit body 内で 1 回だけ使う。複数コマンドは `; ` 区切りの 1 行にまとめる。
- `Verify:` が長くなりすぎる場合は、`Verify:` の直後に箇条書きを連続して置く。コマンドごとに空行を挟んだ `Verify:` 行を繰り返さない。

複数コマンドの記録例:

```text
Verify: npm run tasks:index; npm run tasks:index:check; npm run tasks:check
```

コマンド数が多い場合:

```text
Verify:
- npm run tasks:index
- npm run tasks:index:check
- npm run tasks:check
Risk: なし
```

推奨 type:

| type       | 用途                                 |
| ---------- | ------------------------------------ |
| `feat`     | 機能追加                             |
| `fix`      | バグ修正                             |
| `docs`     | 文書のみの変更                       |
| `refactor` | 振る舞いを変えない整理               |
| `test`     | テスト追加・修正                     |
| `chore`    | タスク管理、メタデータ、生成物整理   |
| `build`    | build、依存、compose、パッケージ周辺 |
| `ci`       | CI、自動化                           |
| `perf`     | 性能改善                             |
| `revert`   | revert                               |

推奨 scope:

| scope       | 用途                        |
| ----------- | --------------------------- |
| `frontend`  | フロントエンド全般          |
| `server`    | Python サーバー全般         |
| `rtc`       | WebRTC / シグナリング契約   |
| `character` | VRM、モーション、表示制御   |
| `settings`  | 設定 UI / 設定モデル        |
| `tasks`     | タスク管理、subagent 成果物 |
| `docs`      | 設計文書、ルール文書        |
| `compose`   | compose / Consul / storage  |
| `agents`    | agent skill / workflow      |
| `deps`      | 依存関係                    |

破壊的変更は `!` または `BREAKING CHANGE:` footer で明示する。通信契約、設定名、保存形式、公開 API を変える場合は、body に移行理由と影響範囲を書く。

```text
feat(rtc)!: change offer response schema

Why: Align the RTC contract with the new session negotiation model.
What: Update the frontend and RTC signaling server to use the new response shape.
Verify: npm run check; npm run test
Risk: Existing clients must be updated with the new response parser.

BREAKING CHANGE: RTCSignalingServer offer response no longer includes ...
Refs: task-260601153000-example
```

実装 commit 例:

```text
feat(settings): add camera device preference

Why: Users need their preferred camera to persist across sessions.
What: Store the selected camera device in the app settings model and apply it during media initialization.
Verify: npm run check
Risk: なし
Refs: task-260601153000-example
```

close commit 例:

```text
chore(tasks): close camera device preference task

Why: The task passed evaluation and can be marked done.
What: Record PASS evaluation and refresh generated task indexes.
Verify: npm run tasks:index; npm run tasks:index:check; npm run tasks:check
Risk: なし
Refs: task-260601153000-example
```

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

通常タスクでは、作業を担当する Codex が `task.md` に沿って実装し、確認結果を `impl.md` に記録する。`review.md` と `eval.md` は subagent pipeline を明示して実行する場合、またはユーザーが独立レビュー / 独立評価を求める場合に必須とする。小変更では `review.md` / `eval.md` が未記入でもよいが、close する前に担当 Codex が実行した確認、未実行理由、残リスクを `impl.md` に残す。

担当 Codex は作業完了時に、`impl.md` の completion summary を元にユーザーへ短く報告する。
報告には、作業概要、変更ファイル、確認結果、実行できなかった確認と理由、残リスク、
次アクションを含める。該当がない項目は「なし」と明示してよい。

| ファイル      | 書き手                | 役割                                                    |
| ------------- | --------------------- | ------------------------------------------------------- |
| `task.md`     | 起票者 / parent Codex | タスク仕様、変更範囲、受け入れ条件。review 後は原則固定 |
| `meta.yaml`   | parent Codex          | 状態メタデータの正本。`tasks:set` で更新                |
| `review.md`   | reviewer subagent     | 実装前レビュー、承認可否、リスク、確認観点              |
| `impl.md`     | 担当 Codex            | 実装ログ、変更内容、確認結果、実行できなかった検証      |
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
reviewed_sha: null
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
| `done`       | PASS 判定で close 済み                         |
| `cancelled`  | 後継なしで取りやめ                             |
| `superseded` | 後継タスクに置き換え                           |

- 終端 status は `done`, `cancelled`, `superseded` とする。
- 終端 status に変更すると、`closed_at` が未指定なら当日で自動設定される。
- `review` は `APPROVED` または `NEEDS_REVISION`、`verdict` は `PASS` または `FAIL` とする。
- `reviewed_sha` は `review=APPROVED` を記録した時点の HEAD SHA とする。`/run-task` はこの SHA からの差分でレビュー段の機械スキップまたは freshness check を判断する。
- `review` と `verdict` は `status` と分け、二重管理を避ける。
- `superseded` では `superseded_by` に後継 task ID を入れる。

## legacy ID

旧 `documents/tasks` 由来の `TASK-...` ID は `legacy_ids` に保持する。コミットメッセージ、設計履歴、古い TODO では `TASK-...` 表記を許容するが、新規のタスク本文と相互参照では canonical ID を優先する。

TODO は新規コードでは `TODO(task-260601153000-example): ...` を推奨する。既存の `TODO(TASK-...)` は移行互換として残してよい。

旧 done タスクは正確な完了日が本文から機械的に取れないため、移行時の `closed_at` は `null` のまま保持する。新方式で close するタスクは `tasks:set status=done` が `closed_at` を設定する。

移行済みタスクの `status: done` と `verdict: PASS` は、旧 `done/` 配下にあった完了状態を `tasks:check` と新 index で扱うための互換メタデータである。`attempts: 0`、未記入の `review.md`、未記入の `eval.md` がある legacy タスクは、subagent reviewer / evaluator を実行済みとは限らない。新方式で close するタスクでは、subagent pipeline を使った場合は `review.md` / `eval.md` に成果物を残し、通常作業の場合も `impl.md` に担当 Codex の確認結果を残す。

## スクリプト

ルートで実行する。

| コマンド                                                                    | 用途                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run tasks:new -- <category> "<title>" [--slug=<slug>] [--depends=a,b]` | 新規タスクを作る                                                   |
| `npm run tasks:set -- <task-dir> key=value ...`                             | `meta.yaml` を決定的に更新する                                     |
| `npm run tasks:index`                                                       | カテゴリ別 `index.md` を生成する                                   |
| `npm run tasks:index:check`                                                 | `index.md` が最新か検証する                                        |
| `npm run tasks:check`                                                       | task directory と `meta.yaml` の整合性を検証する                   |
| `npm run tasks:fixlinks`                                                    | 壊れた Markdown 相対リンクの修正候補を dry-run で表示する          |
| `npm run tasks:fixlinks -- --apply`                                         | 修正候補を適用する                                                 |
| `npm run tasks:migrate:legacy`                                              | 旧 `documents/tasks` レイアウトの移行計画を dry-run する           |
| `npm run tasks:migrate:legacy -- --apply`                                   | 旧 `documents/tasks` レイアウトを `tasks/` へ移行する              |
| `npm run tasks:next`                                                        | 依存が解けて実行できる次タスクを表示する                           |
| `npm run tasks:close -- <task-dir> verdict=PASS attempts=1`                 | meta 更新、index 再生成、close commit をまとめて行う               |
| `npm run tasks:metrics`                                                     | task lead time と agent 実績を集計する                             |
| `npm run gate`                                                              | `package.json` の `gateSteps` をキャッシュ付きで実行する           |
| `npm run eval:worktree -- add <sha>`                                        | 評価用の隔離 worktree を作る                                       |
| `npm run eval:worktree -- remove <path> --discard`                          | 回収済みの評価 worktree を明示破棄する                             |
| `npm run gen:codex`                                                         | `.claude/` から Codex 用 `.agents/skills/` と `.codex/` を生成する |
| `npm run gen:codex:check`                                                   | Codex 生成物が `.claude/` と同期しているか検証する                 |

例:

```sh
npm run tasks:new -- task-management "Update task rules" -- --slug=update-task-rules
npm run tasks:set -- tasks/task-management/task-260601153000-update-task-rules review=APPROVED reviewed_sha=7c45421
npm run tasks:set -- tasks/task-management/task-260601153000-update-task-rules status=done verdict=PASS attempts=1
npm run tasks:index
npm run tasks:check
```

## ブランチライフサイクル

Sincromisor の runner は、Disk I/O とローカル処理時間を増やしすぎないため、既定では単一 checkout 上で進める。role ごとに物理 `git worktree` を作らず、commit と `git status` で clean boundary を保つ。

- parent Codex は role の前後で `git status --porcelain` と現在 HEAD を確認し、ユーザーの未追跡・未コミット変更を誤って巻き込まない。
- reviewer は実装を変更しないため、原則として専用ブランチや物理 worktree を作らない。
- implementer は現在ブランチの HEAD を基点に `codex/<task-id>` ブランチを作る。既に作業ブランチ上にいる場合は、parent Codex が継続可否を判断して記録する。
- implementer は実装差分、テスト、`impl.md` を commit してから evaluator に渡す。`meta.yaml`, `eval.md`, category `index.md` は触らない。
- `/run-task` の evaluator は実装者 HEAD から作った隔離 worktree で独立検証する。評価用の追加ファイルは `acceptance/` に限定し、実装コードや実装者のテストは変更しない。`eval.md` / `acceptance/` は削除前にメイン checkout の task dir へ戻し込む。
- PASS 後、parent Codex は必要に応じて実装ブランチを基点ブランチへ反映し、`tasks:set`, `tasks:index`, task tooling checks を実行して close commit を作る。
- 実装 role 用の物理 `git worktree` は、既存の dirty 変更と衝突する場合、または破壊的変更の検証で必要な場合だけ使う。

## Agent workflow

Agent workflow の正本は `.claude/` である。Codex 用の `.agents/skills/` と `.codex/agents/` は
`npm run gen:codex` で生成し、直接編集しない。生成物 drift は `npm run gen:codex:check` で検出する。

主な入口:

- `/new-task`: 対話文脈から task を起票し、独立 review を通して `review=APPROVED` と `reviewed_sha` を記録する。
- `/review-task`: 既存 `task.md` を単体で独立 review し、`review` と `reviewed_sha` だけを更新する。
- `/next-task`: `tasks:next` で READY / WAITING / BLOCKED を読み取り、次に実行できる task を提示する。
- `/run-task`: review freshness check -> implementation -> independent evaluation -> close を調停する。

Role 定義:

- `.claude/agents/task-reviewer.md`: task specification review。`review.md` だけを書く。
- `.claude/agents/task-freshness-checker.md`: `reviewed_sha` 以降のコード変更で APPROVED の前提が古くなっていないかだけを見る。ファイルは書かない。
- `.claude/agents/task-implementer.md`: 実装、確認、`impl.md`、実装 commit を担当する。
- `.claude/agents/impl-evaluator.md`: 独立評価、`eval.md`、必要な `acceptance/` を担当する。

`/run-task` の流れ:

1. `meta.yaml` の `review` / `reviewed_sha` を読む。
2. `review=APPROVED` かつ `reviewed_sha` から現在 HEAD までの task 外差分がなければ review 段を機械スキップする。
3. APPROVED 後にコード差分がある場合は `task-freshness-checker` で前提の鮮度だけを確認する。
4. 未 APPROVED または STALE の場合は `task-reviewer` を実行し、APPROVED なら `tasks:set review=APPROVED reviewed_sha=<sha>` を記録する。NEEDS_REVISION なら停止する。
5. implementer が `codex/<task-id>` ブランチ上で実装し、`npm run gate` と必要確認を通して `impl.md` を更新し、実装 commit を作る。
6. evaluator が committed diff を独立検証する。`npm run eval:worktree -- add <sha>` で隔離 worktree を作り、評価後は `eval.md` / `acceptance/` をメイン checkout に戻してから `npm run eval:worktree -- remove <path> --discard` で片付ける。
7. FAIL の場合は `eval.md` の残課題を implementer に戻し、原則 2 回まで再実装する。
8. PASS の場合は `npm run tasks:close -- <task-dir> verdict=PASS attempts=<n>` で close する。

実装 commit には実装差分、テスト、`impl.md` を含める。close commit には `review.md`,
`eval.md`, `acceptance/`, `meta.yaml`, `index.md` を含める。`tasks:close` が作る close commit
message も `Why:` / `What:` / `Verify:` / `Risk:` / `Refs:` を含む。upstream workflow との差分は
`.agents/CUSTOMIZATIONS.md` に記録する。

### 完了報告

各 role の成果物には、parent Codex がそのまま要約に使える summary を置く。

- `review.md`: `## Summary for Parent`
- `impl.md`: `## Completion Summary`
- `eval.md`: `## Completion Summary`

parent Codex は subagent 完了通知を受けたら該当ファイルを読み、ユーザーへ短く報告する。
報告を後回しにして pipeline 全体の最後にまとめない。報告には verdict / status、主要な変更や
指摘、確認結果、未実行確認、残リスク、次アクションを含める。

close 前の task tooling checks は必須とする。

```sh
npm run tasks:index
npm run tasks:index:check
npm run tasks:check
```

## 確認コマンド

変更内容に応じて実行範囲を絞ってよい。実行できなかった確認は理由を記録する。

### 3 点ゲート

実装者は完了報告前に、評価者は実装者の報告を鵜呑みにせず独立に、変更範囲に応じた 3 点ゲートを通す。評価者は差分を生む `--fix`, `--write`, format 実行版を使わず、検証専用のコマンドを選ぶ。

標準 gate は `npm run gate` で実行する。`package.json` の `gateSteps` は frontend の `check`,
`build`, `test` を実行し、`check` に Markdown check を含める。Python 全体確認は実行時間と環境依存が
大きいため標準 gate には入れず、Python server を変更する task で下記 Python コマンドを個別に実行する。

| ゲート             | 実装者                                                        | 評価者                                               |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------------- |
| lint / format      | `npm run check`, `uv run ruff check .` など                   | `npm run check`, `uv run ruff format --check .` など |
| 型チェック / build | `npm run build`, `uv run --group dev --group full ty check .` | 同左。差分を生まない build / type check を使う       |
| test               | 変更範囲の `npm run test`, `uv run pytest`                    | 同左。受け入れ条件を満たすか批判的に確認する         |

タスク管理のみの変更では、少なくとも task tooling checks を実行する。Markdown を触った場合は Markdown check を追加する。

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
