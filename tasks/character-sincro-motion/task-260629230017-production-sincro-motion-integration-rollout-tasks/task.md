# Split production sincro motion integration rollout tasks

## 背景 / 目的

本番組み込み gate が文書化された後、実際の適用は巨大な 1 タスクにせず、observe-only、dry-run、腕適用、torso 移行、semantic / finger、全面 `setNormalizedPose()` へ分割する必要がある。

本タスクでは、gate を満たした段階で実行できる具体的な rollout 子タスクを起票する。実装はしない。

## 完了条件（受け入れ条件）

- [ ] gate 文書を読み、`tasks/character-sincro-motion/` 配下に rollout 用の新規 task を必要数起票する。
- [ ] 最低限、`arm-composer-application-hardening`、`torso-shoulder-composer-migration`、`semantic-finger-production-application`、`full-normalized-pose-application`、`production-motion-rollback-and-cleanup` に相当する粒度を分ける。
- [ ] 各 rollout task は依存関係、スコープ外、受け入れ条件、既存コード参照、ドキュメント同期要否、TypeScript production comment audit 条件を持つ。
- [ ] rollout task はすべて `/new-task` 相当の独立レビューで `APPROVED` まで通す。
- [ ] 本タスク自身では production code を変更しない。
- [ ] `tasks/character-sincro-motion/index.md` を更新し、rollout task が index に現れることを確認する。

## 設計判断（着手前に確定済み）

- rollout task の起票は gate 文書完了後に行う。gate が固まる前に実装タスクを先行起票すると、受け入れ条件が抽象的になりやすいため。
- rollout task は本タスクの子というより同カテゴリ内の通常 task として起票する。既存 tooling は物理親子を持たないため、`depends_on` と本文リンクで関係を表す。
- 実装は `/run-task` に委ね、本タスクは起票とレビュー承認までに限定する。

## スコープ境界

- 本タスクでやること: rollout task の起票、依存関係整理、レビュー APPROVED、index 更新。
- 本タスクでやらないこと: production code 変更、VRM 適用、metrics 実装、既存 gate 文書の大幅改訂。
- 依存タスクとの境界: application gates docs task が rollout の条件を提供する。本タスクはその条件を実装タスク群に分解する。

## 実装方針（既存コード整合: file:line）

- task layout と meta 管理は `tasks/README.md` が正本である（`tasks/README.md:80`）。
- 新規 task は `npm run tasks:new -- <category> "<title>" -- --slug=<slug>` で作成する（`tasks/README.md:154`）。
- `meta.yaml` は手で編集せず `tasks:set` を使う（`tasks/README.md:109`）。
- `/new-task` フローは独立レビューを要求している（`.agents/skills/new-task/SKILL.md:31`）。

## テスト

- `npm run tasks:index`
- `npm run tasks:index:check`
- `npm run tasks:check`
- production code を変更しないため frontend build / test は不要。

## ドキュメント同期の要否

不要。タスク起票のみで公開 API / 通信契約 / runtime 挙動は変えない。必要な設計同期は依存 task `production-sincro-motion-application-gates-docs` の責務とする。
