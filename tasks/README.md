# タスク管理

この文書は、Sincromisor のタスク管理、Codex サブエージェントの成果物、検証ログ、コミット単位の運用正本である。

## 基本方針

- タスクは 1 タスク = 1 ディレクトリで管理する。
- 作業状態は物理ディレクトリではなく `meta.yaml` の `status` を正本にする。
- 設計の現在仕様は `documents/design/` に置き、作業ログを設計本文へ溜め込まない。
- 実装、設定、compose、設計文書は必要に応じて同じタスク内で同期する。
- 実行した確認、実行できなかった確認、残リスクは `impl.md` または `eval.md` に残す。
- 通常の Codex 作業でもサブエージェント作業でも、作業完了時はユーザーに作業概要、結果、確認、
  未実行確認、特記事項を報告する。
- 最低限、1 タスク 1 コミットを基本とする。コミットメッセージは Conventional Commits を基に書き、関連するタスク ID または旧形式の `TASK-...` ID をフッターの `Refs:` に含める。
- 説明文、見出し、表の列名は原則として一般的な日本語で書く。コマンド名、ファイル名、設定キー、
  識別子、規格名、固有の状態値など、正確さや検索性のために必要な語だけを英語で残す。

## コミットメッセージ

今後のコミットは [Conventional Commits 1.0.0](https://www.conventionalcommits.org/ja/v1.0.0/) をベースにする。過去コミットは履歴を書き換えず、新規コミットから適用する。

基本形:

```text
<type>(<scope>): <要約>

<本文: 変更理由、主な変更、実行した確認、残リスク・未確認事項>

Refs: task-260601153000-example
```

- `type` は英語小文字で書く。`要約` は日本語でも英語でもよい。
- `scope` は任意だが、履歴検索のため原則付ける。
- 関連タスクはフッターの `Refs:` に正規タスク ID を書く。旧形式のタスクの場合は `Refs: TASK-...` も許容する。
- 件名は変更内容を表す。タスク ID だけ、または `Implement ...` だけの件名は避ける。
- タスクに紐づくコミットの本文には、実装、文書、完了処理、生成索引更新を問わず、変更理由、主な変更、実行した確認、残リスク・未確認事項が後から追えるだけの情報を書く。
- `Why:` / `What:` / `Verify:` / `Risk:` は推奨テンプレートとする。小さな変更では自然文や短い箇条書きでもよいが、上記 4 点の情報を欠落させない。
- 該当事項がない場合も、`Verify: 未実行 (理由)`、`Risk: なし`、または同等の自然文で明示する。
- `Verify:` ラベルを使う場合は 1 コミット本文内で 1 回だけ使う。複数コマンドは `; ` 区切りの 1 行にまとめる。
- `Verify:` が長くなりすぎる場合は、`Verify:` の直後に箇条書きを連続して置く。コマンドごとに空行を挟んだ `Verify:` 行を繰り返さない。
- コマンドラインから複数行メッセージを渡す場合は、件名と各段落を別々の `-m` 引数にするか、実改行を含むメッセージファイルを `-F` で渡す。`git commit -m "subject\\n\\nbody"` のように `\\n` を埋め込んでも Git は改行へ展開しないため禁止する。コミット後は `npm run commit:check` で表示を確認する。

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

| type       | 用途                                  |
| ---------- | ------------------------------------- |
| `feat`     | 機能追加                              |
| `fix`      | バグ修正                              |
| `docs`     | 文書のみの変更                        |
| `refactor` | 振る舞いを変えない整理                |
| `test`     | テスト追加・修正                      |
| `chore`    | タスク管理、メタデータ、生成物整理    |
| `build`    | ビルド、依存、compose、パッケージ周辺 |
| `ci`       | CI、自動化                            |
| `perf`     | 性能改善                              |
| `revert`   | 変更の取り消し                        |

推奨 scope:

| scope       | 用途                               |
| ----------- | ---------------------------------- |
| `frontend`  | フロントエンド全般                 |
| `server`    | Python サーバー全般                |
| `rtc`       | WebRTC / シグナリング契約          |
| `character` | VRM、モーション、表示制御          |
| `settings`  | 設定 UI / 設定モデル               |
| `tasks`     | タスク管理、サブエージェント成果物 |
| `docs`      | 設計文書、ルール文書               |
| `compose`   | compose / Consul / 保存領域        |
| `agents`    | エージェントのスキル・作業手順     |
| `deps`      | 依存関係                           |

破壊的変更は `!` または `BREAKING CHANGE:` フッターで明示する。通信契約、設定名、保存形式、公開 API を変える場合は、本文に移行理由と影響範囲を書く。

```text
feat(rtc)!: offer 応答のスキーマを変更

Why: 新しいセッション交渉方式へ RTC 契約を合わせるため。
What: フロントエンドと RTC シグナリングサーバーを新しい応答形式へ更新。
Verify: npm run check; npm run test
Risk: 既存クライアントも新しい応答解析へ更新する必要がある。

BREAKING CHANGE: RTCSignalingServer offer response no longer includes ...
Refs: task-260601153000-example
```

実装コミット例:

```text
feat(settings): カメラ端末の選択を保存

Why: 利用者が選んだカメラをセッション間で維持するため。
What: 選択したカメラ端末をアプリ設定へ保存し、メディア初期化時に適用。
Verify: npm run check
Risk: なし
Refs: task-260601153000-example
```

完了処理コミット例:

```text
chore(tasks): カメラ端末設定タスクを完了

Why: タスクが評価に合格し、完了状態へ移せるため。
What: PASS 判定を記録し、生成されるタスク索引を更新。
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
- 正規 ID はディレクトリ名と一致する `task-<id>-<slug>` とする。
- `index.md` は `tasks:index` が自動生成する。手書き前文は残せるが、AUTOGEN ブロック内は編集しない。

## ファイルの役割

通常タスクは、担当 Codex が `task.md` に沿って実装し、差分とテスト結果を確認すればよい。`review.md` と `eval.md` はユーザーが独立確認を求めた場合、または高リスク統合タスクで独立確認を行った場合だけ記録する。`impl.md` は設計判断、仕様からの逸脱、未実行の確認、残リスクがある場合だけ簡潔に使い、コミット内容を複製しない。

担当 Codex は作業概要、確認結果、未実行事項、残リスクを短く報告する。

| ファイル      | 書き手                       | 役割                                                     |
| ------------- | ---------------------------- | -------------------------------------------------------- |
| `task.md`     | 起票者 / 親 Codex            | タスク仕様、変更範囲、受け入れ条件。レビュー後は原則固定 |
| `meta.yaml`   | 親 Codex                     | 状態メタデータの正本。`tasks:set` で更新                 |
| `review.md`   | レビュー担当サブエージェント | 実装前レビュー、承認可否、リスク、確認観点               |
| `impl.md`     | 担当 Codex                   | 必要な判断、逸脱、未実行の確認、残リスク                 |
| `eval.md`     | 評価担当サブエージェント     | 独立評価、品質ゲート結果、PASS / FAIL                    |
| `acceptance/` | 評価担当サブエージェント     | 独立検証用の補助ファイル                                 |
| `artifacts/`  | 各担当                       | タスク固有のログ、CSV、スクリーンショット、調査メモ      |

### 公開成果物と非公開検証原本

`tasks/**/artifacts/` は公開リポジトリへコミットされる領域である。集計 JSON、CSV、再現手順、
入力の SHA-256、機密性を確認済みの小さな固定データだけを置く。実写動画、検証画像、カメラ映像、フレーム単位の
未加工再生記録（NDJSON / JSONL）、追跡記録、個人情報を含み得る原本は
`work/private-artifacts/<task-id>/` にまとめる。この領域はGit管理外であり、開発者が保管・共有・
削除を明示的に管理する。別環境で再現する場合は、タスク文書に記録した SHA-256 で同一性を確認する。

`tasks:close` はタスク内の動画、画像、未加工再生記録、`artifacts/private/`、5 MiB を超える成果物を検出すると
停止する。例外的に公開が必要な固定データは、機密性・ライセンス・容量をレビューした上でタスク外の
正式なテスト用固定データ領域へ置き、生成方法と採用理由を記録する。

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

### 状態

| status       | 意味                                           |
| ------------ | ---------------------------------------------- |
| `open`       | 未完。着手前、実装中、または FAIL 後の継続対象 |
| `blocked`    | 外部要因、依存、意思決定待ちで停止中           |
| `done`       | PASS 判定で完了処理済み                        |
| `cancelled`  | 後継なしで取りやめ                             |
| `superseded` | 後継タスクに置き換え                           |

- 終端状態は `done`, `cancelled`, `superseded` とする。
- 終端状態に変更すると、`closed_at` が未指定なら当日で自動設定される。
- `review` は `APPROVED` または `NEEDS_REVISION`、`verdict` は `PASS` または `FAIL` とする。
- `reviewed_sha` は過去タスクと外部ツール向けの互換フィールドである。通常の `/run-task` は現在のコードを直接確認し、この値をゲートに使わない。
- `review` と `verdict` は `status` と分け、二重管理を避ける。
- `superseded` では `superseded_by` に後継タスク ID を入れる。

### 失敗時の調査と継続

必須のtest、gate、実測scenarioの失敗は調査の開始条件であり、それだけではtaskの完了条件にならない。

- 失敗直後は、command、対象commit、入力、時刻、exit code、関連log、process・network・resource状態など、
  cleanupや環境復旧で失われる証拠と、その状態でしかできない初期切り分けを先に完了する。共有serviceなどを
  停止した場合は、これらの完了後、長いoffline調査より先に復旧して他作業への影響を止める。
- 直接原因と修正対象を特定し、最小の再現確認、修正、失敗した確認、必要な全体gateの順で再検証する。
  taskの前提や受け入れ条件が誤っていた場合は、実装を続けずtask改訂へ戻す。
- 原因が未特定の必須失敗が残る間はevaluatorを`PASS`にせず、taskを`done`へせず、実装worktreeを削除しない。
  継続可能なら`open`、外部要因や権限待ちなら原因と解除条件を記録して`blocked`にする。
- `tasks:close verdict=FAIL`は、原因と証拠を記録した現在attemptを`open`のまま区切るためにだけ使う。
  原因調査を省略してFAILを記録する手段ではない。
- 原因修正を別taskへ移す場合は、再現手順、証拠、特定済み原因、移管理由、後続task IDを残し、
  ユーザーが移管を了承した場合に限る。原因不明のまま後続taskへ送って元taskを完了しない。

## 旧形式の ID

旧 `documents/tasks` 由来の `TASK-...` ID は `legacy_ids` に保持する。コミットメッセージ、設計履歴、古い TODO では `TASK-...` 表記を許容するが、新規のタスク本文と相互参照では正規 ID を優先する。

TODO は新規コードでは `TODO(task-260601153000-example): ...` を推奨する。既存の `TODO(TASK-...)` は移行互換として残してよい。

旧 `done` タスクは正確な完了日が本文から機械的に取れないため、移行時の `closed_at` は `null` のまま保持する。新方式で完了処理するタスクは `tasks:set status=done` が `closed_at` を設定する。

移行済みタスクの `status: done` と `verdict: PASS` は、旧 `done/` 配下にあった完了状態を `tasks:check` と新しい索引で扱うための互換メタデータである。`attempts: 0`、未記入の `review.md`、未記入の `eval.md` がある旧形式のタスクは、サブエージェントのレビュー担当・評価担当を実行済みとは限らない。新方式で完了処理するタスクでは、サブエージェント作業手順を使った場合は `review.md` / `eval.md` に成果物を残し、通常作業の場合も `impl.md` に担当 Codex の確認結果を残す。

## スクリプト

ルートで実行する。

| コマンド                                                                    | 用途                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run tasks:new -- <category> "<title>" [--slug=<slug>] [--depends=a,b]` | 新規タスクを作る                                                                        |
| `npm run tasks:set -- <task-dir> key=value ...`                             | `meta.yaml` を決定的に更新する                                                          |
| `npm run tasks:index`                                                       | カテゴリ別 `index.md` を生成する                                                        |
| `npm run tasks:index:check`                                                 | `index.md` が最新か検証する                                                             |
| `npm run tasks:check`                                                       | タスクディレクトリと `meta.yaml` の整合性を検証する                                     |
| `npm run tasks:check:frontend-structure`                                    | フロントエンドの TS/TSX で 300 行超のファイルを一覧表示し、変更ファイルは厳格に検証する |
| `npm run tasks:fixlinks`                                                    | 壊れた Markdown 相対リンクの修正候補を試行表示する                                      |
| `npm run tasks:fixlinks -- --apply`                                         | 修正候補を適用する                                                                      |
| `npm run tasks:migrate:legacy`                                              | 旧 `documents/tasks` レイアウトの移行計画を試行表示する                                 |
| `npm run tasks:migrate:legacy -- --apply`                                   | 旧 `documents/tasks` レイアウトを `tasks/` へ移行する                                   |
| `npm run tasks:migrate:reviewed-sha`                                        | 既存 `meta.yaml` へ `reviewed_sha` を付与する計画を試行表示する                         |
| `npm run tasks:next`                                                        | 依存が解けて実行できる次タスクを表示する                                                |
| `npm run tasks:close -- <task-dir> verdict=PASS attempts=1`                 | メタデータを更新し、自タスクディレクトリの完了処理コミットを行う                        |
| `npm run tasks:reindex`                                                     | 全カテゴリ `index.md` を再生成し、変更があればコミットする                              |
| `npm run tasks:metrics`                                                     | タスクの所要時間とエージェント実績を集計する                                            |
| `npm run gate`                                                              | `package.json` の `gateSteps` をキャッシュ付きで実行する                                |
| `npm run eval:worktree -- add <sha>`                                        | 指定コミットの一時作業ツリーを作る                                                      |
| `npm run eval:worktree -- add <sha> --branch codex/<task-id>`               | 実装用の名前付き作業ツリーを作る                                                        |
| `npm run eval:worktree -- remove <path> --discard`                          | 不要になった一時作業ツリーを明示破棄する                                                |
| `npm run gen:codex`                                                         | `.claude/` から Codex 用 `.agents/skills/` と `.codex/` を生成する                      |
| `npm run gen:codex:check`                                                   | Codex 生成物が `.claude/` と同期しているか検証する                                      |

例:

```sh
npm run tasks:new -- task-management "タスク規則を更新" -- --slug=update-task-rules
npm run tasks:set -- tasks/task-management/task-260601153000-update-task-rules review=APPROVED reviewed_sha=7c45421
npm run tasks:set -- tasks/task-management/task-260601153000-update-task-rules status=done verdict=PASS attempts=1
npm run tasks:index
npm run tasks:check
```

`tasks:check:frontend-structure` は `sincromisor-frontend/src/**/*.ts` と `*.tsx` を対象に、
既存の 300 行超ファイルを一覧として標準出力へ表示する。`git diff main --name-only --
sincromisor-frontend/src` で取得した変更済み TS/TSX ファイルだけは厳格に検証し、300 行を
超える場合は失敗する。段階的な分割を阻害しないため、既存巨大ファイルの一覧は単独では
失敗扱いにしない。

## ブランチライフサイクル

実装は専用の `git worktree` で進める。独立評価を行う場合も同じ worktree のコミット済み差分を使い、評価専用 worktree は作らない。

- レビュー担当は実装を変更しないため、専用ブランチや物理作業ツリーを作らない。
- 実装担当用作業ツリーは `npm run eval:worktree -- add <base-sha> --branch codex/<task-id>` で作る。`codex/` 接頭辞は `package.json` の `taskBranchPrefix` を正本にする。
- 実装担当は渡された作業ツリーの絶対パスを作業ディレクトリとし、実装差分、テスト、実装コミットを `codex/<task-id>` ブランチへ載せる。`impl.md` はメインチェックアウト側のタスクディレクトリに追記する。
- `npm run gate` は `.gate-cache/` を作業ツリー間で共有し、同一内容・コミットの PASS をキャッシュする。
- 評価担当は実装 worktree のコミット済み差分を変更せずに検証し、`eval.md` はメインチェックアウト側へ書く。
- PASS 後、親 Codex は基点ブランチで `git merge codex/<task-id>` を行い、`npm run tasks:close -- <task-dir> verdict=PASS attempts=<n>` で自タスクディレクトリの完了処理コミットを作る。
- 全体の `index.md` 更新は完了処理から分離し、基点ブランチ上の直列段階として `npm run tasks:reindex` で 1 コミットにまとめる。
- `git worktree remove` はブランチを削除しない。実装ブランチは履歴確認や再開のため残し、不要になった場合だけ別途整理する。

## エージェント作業手順

エージェント作業手順の正本は `.claude/` である。Codex 用の `.agents/skills/` と `.codex/agents/` は
`npm run gen:codex` で生成し、直接編集しない。生成物のずれは `npm run gen:codex:check` で検出する。

主な入口:

- `/new-task`: 対話文脈から実装可能な `task.md` を起票する。
- `/run-task`: 現在のコードで着手可否を確認し、実装、検証、完了処理を調停する。
- 次タスクの抽出は `npm run tasks:next` を直接使う。

役割の定義:

- `.claude/agents/task-reviewer.md`: 明示要求または高リスク時のタスク仕様レビュー。
- `.claude/agents/task-implementer.md`: 実装、確認、`impl.md`、実装コミットを担当する。
- `.claude/agents/impl-evaluator.md`: 明示要求または高リスク時の独立評価。

`/run-task` の流れ:

1. `task.md`、依存、関連コードを現在の HEAD で確認し、前提が古ければタスク改訂へ戻す。
2. 明示要求または高リスク時だけ task-reviewer を呼ぶ。
3. 実装 worktree を1つ作り、実装担当が変更、対象テスト、`npm run gate`、コミットを行う。
4. 必須確認が失敗した場合は、上記「失敗時の調査と継続」に従って証拠採取、原因特定、修正、再検証を行う。
5. 親が受け入れ条件と差分を確認する。明示要求または高リスク時だけ、同じ worktree で impl-evaluator を呼ぶ。
6. 原因不明の必須失敗がなくPASSなら、マージ、`tasks:close`、`tasks:reindex`、worktree削除の順で完了する。

実装コミットには実装差分、テスト、必要な文書を含める。タスク成果物は `tasks:close` がまとめる。`index.md` は `tasks:reindex` コミットに含める。`tasks:close` が作る完了処理コミットの
メッセージも `Why:` / `What:` / `Verify:` / `Risk:` / `Refs:` を含む。上流の作業手順との差分は
`.agents/CUSTOMIZATIONS.md` に記録する。

### リスクに応じた作業手順

通常の局所変更には、3 点ゲート、コメント点検、ドキュメント同期など既存の基本規約を適用する。
複数のリソース所有者・状態機械・外部境界、再試行・時間切れ・時刻・終了処理、全称条件を含む
高リスク統合タスクだけは、`tasks/AUTHORING-CHECKLIST.md` の追加確認を行う。
RTC 第 3 段階で使った個別の所有権表や指標表を、無関係なタスクへ一律に要求しない。

コメント品質は `documents/rules/source-comments.md` と対象言語規約を直接適用する。task.md、impl.md、eval.md に別のコメント監査台帳を作らない。

### 完了報告

親 Codex は差分と確認結果から簡潔に報告する。成果物ごとの重複した要約は要求しない。

サブエージェントを使った場合も、重複した中間報告はせず最終報告へ必要な結果だけ反映する。

完了処理前のタスク管理ツール確認は必須とする。

```sh
npm run tasks:index
npm run tasks:reindex -- --dry-run
npm run tasks:index:check
npm run tasks:check
```

## 確認コマンド

変更内容に応じて実行範囲を絞ってよい。実行できなかった確認は理由を記録する。

### 3 点ゲート

実装者は完了報告前に、評価者は実装者の報告を鵜呑みにせず独立に、変更範囲に応じた 3 点ゲートを通す。評価者は差分を生む `--fix`, `--write` や整形実行版を使わず、検証専用のコマンドを選ぶ。

標準ゲートは `npm run gate` で実行する。`package.json` の `gateSteps` はフロントエンドの `check`,
`build`, `test` を実行し、`check` に Markdown 検査を含める。Python 全体確認は実行時間と環境依存が
大きいため標準ゲートには入れず、Python サーバーを変更するタスクで下記 Python コマンドを個別に実行する。

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
