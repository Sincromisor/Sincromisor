# タスク管理

この文書は、Sincromisor のタスク管理、Codex サブエージェントの成果物、検証ログ、コミット単位の運用正本である。

## 基本方針

- この仕組みは作業を前へ進めるために使う。趣味の個人開発として、通常変更は最小の実装、対象を絞った確認、1コミットで完了させる。
- タスクは 1 タスク = 1 ディレクトリで管理する。
- 作業状態は物理ディレクトリではなく `meta.yaml` の `status` を正本にする。
- 設計の現在仕様は `documents/design/` に置き、作業ログを設計本文へ溜め込まない。
- 実装、設定、compose、設計文書は必要に応じて同じタスク内で同期する。
- 実行した確認、実行できなかった確認、残リスクはコミットと最終報告を正本とする。独立評価や非自明な判断がある場合だけ `impl.md` または `eval.md` を使う。
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

通常タスクは、親 Codex が現在のworktreeで `task.md` に沿って実装し、変更範囲に対応する確認を行えばよい。`review.md` と `eval.md` はユーザーが独立確認を求めた場合、または高リスク変更で独立確認を行った場合だけ記録する。`impl.md` は設計判断、仕様からの逸脱、未実行の確認、残リスクがある場合だけ簡潔に使い、コミット内容を複製しない。

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

### 起票時の実装可能性

起票者は現在の HEAD と関連コードを確認し、問題、最小の完了状態、変更範囲、確認方法だけを `task.md` に書く。必須要件は、ユーザー要求、既存の公開契約、再現済み不具合、セキュリティ・データ損失防止、実行に不可欠な制約のいずれかを根拠とする。

性能値、負荷・soak試験、browser・端末matrix、網羅率、production相当環境は、実測baseline、外部制約、再現済み問題、またはユーザーの明示要求がある場合だけ必須にする。それ以外は開発環境で主要経路が一度動作することを既定の完了条件とする。

外部境界がある場合だけ、設定値・port・address・image command・healthcheck の供給元、消費先、正本を特定する。複数の妥当な方式が残り、公開契約や責務を変える場合だけ先に設計判断を確定する。

高リスク変更は、起票時の独立レビューを原則とする。レビューは不足を追加するだけでなく、根拠のない要件を削り、個人開発で実行可能な最小単位へ縮小する。既存の正本から一意に補える不足は `AUTO_FIX` として反映し、公開契約・責務・利用者が求める結果を変える選択が必要な場合だけ `NEEDS_REVISION` とする。

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

停止条件にするのは、今回の差分が原因で、受け入れ条件に直接対応する確認が失敗した場合である。セキュリティ、データ損失、公開契約、本番切替に関する失敗は常に停止条件とする。

変更前からある不整合、変更範囲外の検査失敗、任意確認を実行できないことは警告として報告し、今回の変更が悪化させていなければtaskを完了できる。変更した文書の整形など、安全かつ一意に直せる不整合は自動修正する。ユーザーの未コミット変更や変更範囲外のファイルは無断で修正しない。

- 高リスクな実環境確認の失敗直後は、command、対象commit、入力、時刻、exit code、関連log、process・network・resource状態など、
  cleanupや環境復旧で失われる証拠と、その状態でしかできない初期切り分けを先に完了する。共有serviceなどを
  停止した場合は、これらの完了後、長いoffline調査より先に復旧して他作業への影響を止める。
- 今回の差分が原因なら、直接原因と修正対象を特定し、最小の再現確認、修正、失敗した確認の順で再検証する。
  taskの前提や受け入れ条件が誤っていた場合は、実装を続けずtask改訂へ戻す。
- 今回の差分による原因未特定の必須失敗が残る間はevaluatorを`PASS`にせず、taskを`done`へしない。
  継続可能なら`open`、外部要因や権限待ちなら原因と解除条件を記録して`blocked`にする。
- `tasks:close verdict=FAIL`は、原因と証拠を記録した現在attemptを`open`のまま区切るためにだけ使う。
  原因調査を省略してFAILを記録する手段ではない。
- 今回の差分が生んだ原因修正を別taskへ移す場合は、再現手順、証拠、特定済み原因、移管理由、後続task IDを残し、
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

## 作業経路とブランチ

変更リスクに応じて次の経路を使う。

| 区分         | 対象                                                                   | 標準経路                                                                     |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 通常変更     | 単一領域の局所変更                                                     | 現在のworktreeで直接実装、対象確認、task状態と索引を含む1コミット            |
| 統合変更     | 複数component、設定、文書の同期                                        | 必要な結合確認。並行作業やdirty worktreeとの分離が必要な場合だけ専用worktree |
| 高リスク変更 | セキュリティ、データ損失、公開通信契約、本番切替、複数所有者の状態機械 | 専用worktree、独立レビュー・評価、全体gateと必要な実環境確認                 |

通常変更では `tasks:set status=done verdict=PASS attempts=1` と `tasks:index` を実行し、実装、タスク記録、索引を同じコミットに含める。専用のclose・reindexコミットは作らない。

専用worktreeを使う場合は、独立評価も同じ worktree のコミット済み差分を使い、評価専用 worktree は作らない。

- レビュー担当は実装を変更しないため、専用ブランチや物理作業ツリーを作らない。
- 必要な場合だけ実装担当用作業ツリーを `npm run eval:worktree -- add <base-sha> --branch codex/<task-id>` で作る。`codex/` 接頭辞は `package.json` の `taskBranchPrefix` を正本にする。
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

1. `task.md`、依存、関連コードを現在の HEAD で確認し、通常・統合・高リスクの経路を選ぶ。
2. 既存の正本から一意に決まる不足は自律補完し、根拠のない要件は削る。公開契約、責務、利用者が求める結果を変える選択だけタスク改訂へ戻す。
3. 通常変更は親が現在のworktreeで直接実装する。統合変更は必要な場合だけ、高リスク変更は原則として実装worktreeを使う。
4. 変更範囲に対応する最小の確認を行う。全体gateは高リスク変更、または変更が横断的で全体回帰を検出できる場合だけ実行する。
5. 明示要求または高リスク時だけ task-reviewer / impl-evaluator を呼ぶ。
6. 通常変更は実装・task状態・索引を1コミットにまとめる。worktreeを使った変更は既存のmerge、`tasks:close`、`tasks:reindex`、worktree削除で完了する。

着手確認で見つかった不足も同じ基準で扱う。既存の正本から一意に決まり、公開契約・責務・利用者が求める結果を変えない `AUTO_FIX` は実装を継続する。通常変更では最終報告へ記し、別記録が必要な場合だけ `impl.md` を使う。

通常変更のコミットには実装差分、テスト、必要な文書、task状態、`index.md` を含める。worktreeを使う経路では、タスク成果物は `tasks:close`、`index.md` は `tasks:reindex` コミットに含める。`tasks:close` が作る完了処理コミットの
メッセージも `Why:` / `What:` / `Verify:` / `Risk:` / `Refs:` を含む。上流の作業手順との差分は
`.agents/CUSTOMIZATIONS.md` に記録する。

### リスクに応じた作業手順

通常の局所変更には、変更ファイルの整形、対象を絞ったlint・型確認・テストだけを適用する。
複数のリソース所有者・状態機械・外部境界、再試行・時間切れ・時刻・終了処理を含む
高リスク変更だけは、`tasks/AUTHORING-CHECKLIST.md` の追加確認、独立レビュー・評価、全体gateを検討する。
RTC 第 3 段階で使った個別の所有権表や指標表を、無関係なタスクへ一律に要求しない。

コメント品質は `documents/rules/source-comments.md` と対象言語規約を直接適用する。本番コードを変更した場合は、変更したシンボル・処理群・判断と直接の変更理解範囲を全件点検し、必須コメントの欠落・説明不足・stale comment を解消するまで完了しない。既存コード由来でも変更理解範囲内なら今回の対象とする。task.md、impl.md、eval.md に別のコメント監査台帳は作らず、最終報告に `コメント点検: PASS` と記す。

### 完了報告

親 Codex は差分と確認結果から簡潔に報告する。成果物ごとの重複した要約は要求しない。

サブエージェントを使った場合も、重複した中間報告はせず最終報告へ必要な結果だけ反映する。

通常変更では、コミット前に次を実行する。

```sh
npm run tasks:index
npm run tasks:index:check
npm run tasks:check
```

## 確認コマンド

変更内容に応じて実行範囲を絞ってよい。実行できなかった確認は理由を記録する。

### 3 点ゲート

3点ゲートは高リスク変更、または変更が横断的で対象確認だけでは回帰を検出できない場合に使う。通常変更では変更ファイルを整形し、対象を絞ったlint・型確認・テストだけを実行する。

全体ゲートは `npm run gate` で実行する。`package.json` の `gateSteps` はフロントエンドの `check`,
`build`, `test` を実行し、`check` にリポジトリ全体の Markdown 検査を含める。このため、通常変更の完了判定には使わない。全体gateが変更範囲外の既存不整合で失敗した場合は、該当pathを警告として報告し、今回の差分が悪化させていないことを対象確認で示せばよい。

Python 全体確認は実行時間と環境依存が大きいため全体ゲートには入れず、Python サーバーを変更するタスクで下記コマンドから必要なものだけ実行する。

| ゲート             | 実装者                                                        | 評価者                                               |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------------- |
| lint / format      | `npm run check`, `uv run ruff check .` など                   | `npm run check`, `uv run ruff format --check .` など |
| 型チェック / build | `npm run build`, `uv run --group dev --group full ty check .` | 同左。差分を生まない build / type check を使う       |
| test               | 変更範囲の `npm run test`, `uv run pytest`                    | 同左。受け入れ条件を満たすか批判的に確認する         |

タスク管理のみの変更では task tooling checks を実行する。Markdown は変更ファイルだけをPrettierで整形・確認する。リポジトリ全体のMarkdown checkは任意の健全性確認とし、変更範囲外の失敗でtaskを止めない。

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
