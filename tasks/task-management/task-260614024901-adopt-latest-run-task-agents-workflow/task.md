# run-task-agents latest workflow adoption

## 目的

`~/projects/run-task-agents` の最新版を基準に、Sincromisor の AI agent / task workflow 基盤を更新する。
原則として最新版の workflow に合わせ、Sincromisor 独自カスタマイズは必要最小限に限定する。
将来も同じ upstream kit を再適用する見込みがあるため、独自カスタマイズした箇所・理由・upstream との差分を追跡できる記録を残す。

## 背景

現行 Sincromisor は Codex skill を手書きで 4 本だけ管理している。

- `.agents/skills/sincromisor-task-runner/SKILL.md`
- `.agents/skills/task-reviewer/SKILL.md`
- `.agents/skills/task-implementer/SKILL.md`
- `.agents/skills/impl-evaluator/SKILL.md`

一方、最新版 `run-task-agents` は `.claude/` を単一ソースとし、Codex 用の `.agents/skills/` と
`.codex/agents/*.toml` を `gen:codex` で生成する構成になっている。加えて、`/new-task`,
`/review-task`, `/next-task`, `/run-task`, `task-freshness-checker`, `reviewed_sha`,
`tasks:next`, `tasks:close`, `tasks:metrics`, `gate`, `eval:worktree` が追加されている。

事前調査では、現行の `npm run tasks:check` と `npm run tasks:index:check` は成功しており、
157 task の既存データは整合している。したがって、このタスクは破損修復ではなく、動作中の軽量版を
最新版 workflow へ段階的に置き換える移行である。

## 変更範囲

- `.claude/`
    - `~/projects/run-task-agents/.claude/commands/` と `.claude/agents/` を導入し、Sincromisor 向けの必要最小限の文言・確認コマンド・正本文書リンクだけを調整する。
    - `.claude/settings.json` の hook 設定を導入する。
- `.codex/`
    - `gen:codex` 生成物として `.codex/agents/*.toml` と `.codex/hooks.json` を導入する。
- `.agents/skills/`
    - 手書き 4 skill を、`.claude/commands/` 由来の生成 skill に置き換える。
    - 生成 skill は少なくとも `new-task`, `review-task`, `next-task`, `run-task` を含む。
- `scripts/`
    - 最新版の `scripts/gen`, `scripts/gate`, `scripts/eval`, `scripts/metrics` を導入する。
    - `scripts/tasks` は最新版をベースにしつつ、Sincromisor 既存の `tasks:check`, `tasks:migrate:legacy`, `legacy_ids` 互換を維持する。
- `package.json`
    - 最新版 workflow 用 scripts と設定を追加する。
    - 必要な依存を追加する。`yaml` を導入する場合は lockfile 生成要否も確認する。
- `.gitignore`
    - 生成 skill / `.codex` / `.claude` / customization 記録が Git 追跡対象になるよう更新する。
    - `.claude/metrics/` などローカル計測データは Git 追跡しない。
- `tasks/README.md`, `AGENTS.md`
    - 新 workflow の入口と運用を正本として更新する。
    - 既存 legacy task 互換説明は維持する。
- カスタマイズ記録
    - 今後の upstream 再適用時に参照できる永続的な記録を追加する。
    - 置き場所は実装時に決めてよいが、例として `tasks/run-task-agents-customizations.md` または `.agents/CUSTOMIZATIONS.md` のように、agent workflow 更新時に自然に見つかる場所に置く。

## 設計判断

- upstream 追従の正本は `.claude/` とする。Codex 用 `.agents/skills/` と `.codex/` は生成物として扱い、直接編集しない。
- 最新版 workflow の機能は原則採用する。
    - `/new-task` 相当の起票 + 独立レビュー
    - `/run-task` の 3 段レビュー gate
    - `reviewed_sha` によるレビュー重複回避
    - `task-freshness-checker`
    - `gate` による 3 点 gate キャッシュ
    - `tasks:close`
    - `tasks:next`
    - `tasks:metrics`
    - `eval:worktree`
- Sincromisor 独自カスタマイズは次に限定する。
    - 既存 `legacy_ids` を保持する。旧 `TASK-...` 互換と 157 件の既存 task 履歴を壊さないため。
    - `tasks:check` を保持・更新する。既存 task schema の整合性確認で使っているため。
    - `tasks:migrate:legacy` を残す。旧 task 移行の履歴・再確認に必要なため。
    - Sincromisor の正本文書リンクを `AGENTS.md`, `documents/design/`, `documents/rules/`, `tasks/README.md` に合わせる。
    - `gateSteps` は Sincromisor の frontend / Python / Markdown 確認コマンドに合わせる。ただし、非決定的または重い実機確認は gate から外し、task ごとの確認に残す。
    - upstream と異なる branch prefix や checkout 方針を採用する場合は、必ずカスタマイズ記録に理由を書く。理由が弱い場合は upstream の `task/<id>` 方針に寄せる。
- `meta.yaml` schema は最新版の `reviewed_sha` を追加しつつ、Sincromisor 既存の `legacy_ids` を残す。
- `review.md`, `impl.md`, `eval.md`, `acceptance/`, `artifacts/` の既存 layout は維持する。
- `gen:codex:check` を導入し、`.claude/` と Codex 生成物の drift を検出できるようにする。

## 既存コード整合

- `package.json:5` から `package.json:12` は現行 task scripts のみを定義している。最新版 workflow 用の `gate`, `tasks:next`, `tasks:close`, `tasks:metrics`, `eval:worktree`, `gen:codex`, `gen:codex:check` を追加する。
- `scripts/tasks/lib.mjs:76` から `scripts/tasks/lib.mjs:89` は `meta.yaml` の deterministic key order を定義している。ここへ `reviewed_sha` を追加し、`legacy_ids` は削除しない。
- `scripts/tasks/lib.mjs:96` から `scripts/tasks/lib.mjs:113` は meta 読み取り時の default 補完を行う。`reviewed_sha` を安全に読む処理を追加する。
- `scripts/tasks/checkTasks.mjs:22` から `scripts/tasks/checkTasks.mjs:35` は必須 meta key を検証している。`reviewed_sha` を追加し、`legacy_ids` は必須 key として保持する。
- `scripts/tasks/checkTasks.mjs:102` から `scripts/tasks/checkTasks.mjs:107` は `review`, `verdict`, `legacy_ids`, 日付の検証を行う。`reviewed_sha` の `null` または 7-40 桁 hex 検証を追加する。
- `.gitignore:9` から `.gitignore:20` は `.agents` を基本 ignore し、既存 4 skill だけを追跡許可している。生成 skill と `.claude`, `.codex`, customization 記録を追跡できるよう更新する。
- `AGENTS.md:93` から `AGENTS.md:100` は現行の task / commit 入口を説明している。最新版 workflow の入口に合わせる。
- `tasks/README.md:170` から `tasks/README.md:177` は現行 meta schema の例を示している。`reviewed_sha` を追加し、`legacy_ids` 互換を残す。
- `tasks/README.md:212` から `tasks/README.md:222` は現行 scripts 一覧である。最新版 workflow 用 scripts を追加する。
- `tasks/README.md:234` から `tasks/README.md:244` は現行 branch lifecycle である。upstream 方針へ寄せるか、Sincromisor 独自方針として残すかを判断し、残す場合はカスタマイズ記録へ理由を書く。
- `tasks/README.md:246` から `tasks/README.md:269` は現行 Codex subagent pipeline である。`.claude` 単一ソース + Codex 生成物 + `/new-task` / `/run-task` へ更新する。

## 受け入れ条件

- [ ] `.claude/` を単一ソースとして導入し、Codex 用 `.agents/skills/` と `.codex/` が `npm run gen:codex` で生成される。
- [ ] `npm run gen:codex:check` が生成物の drift を検出でき、最新状態では成功する。
- [ ] 既存手書きの `sincromisor-task-runner` 中心の入口を、最新版 workflow の `new-task`, `review-task`, `next-task`, `run-task` に置き換える。
- [ ] `task-freshness-checker` が導入され、`reviewed_sha` を基準にした 3 段レビュー gate の運用が文書化されている。
- [ ] `meta.yaml` に `reviewed_sha` を追加できる。既存 157 task の `legacy_ids` と legacy terminal 互換は壊さない。
- [ ] `tasks:check` が `reviewed_sha` と `legacy_ids` の両方を検証し、既存 task 群に対して成功する。
- [ ] `tasks:next`, `tasks:close`, `tasks:metrics`, `gate`, `eval:worktree` が package scripts として利用できる。
- [ ] Sincromisor 用 `gateSteps` が定義され、少なくとも frontend の `check`, `build`, `test` と Markdown 確認の扱いが明確になっている。Python 全体確認を gate に入れない場合は、理由と task ごとの実行方針を文書化する。
- [ ] `.claude/metrics/` などローカル実績ログは Git 追跡から除外される。
- [ ] 生成物として追跡すべき `.agents/skills/` と `.codex/` が `.gitignore` によって誤って除外されない。
- [ ] `tasks/README.md` と `AGENTS.md` が最新版 workflow の入口、role 分担、close 手順、独立評価、customization 記録の扱いを説明している。
- [ ] upstream との差分を追跡するカスタマイズ記録ファイルが追加され、各独自カスタマイズについて「対象ファイル」「upstream との差分」「理由」「将来更新時の確認方法」が書かれている。
- [ ] `~/projects/run-task-agents` からコピーしたままの汎用説明に `<RUNNER>` や `<...>` など未置換 placeholder が残っていない。ただし意図的なテンプレート例は除く。
- [ ] 実装後、`DESIGN.md` と `MEMO.md` など既存の未追跡ファイルを巻き込まない。

## 確認

- [ ] `npm run tasks:check`
- [ ] `npm run tasks:index`
- [ ] `npm run tasks:index:check`
- [ ] `npm run gen:codex`
- [ ] `npm run gen:codex:check`
- [ ] `npm run tasks:next -- --json`
- [ ] `npm run tasks:close -- --dry-run <このタスク以外のテスト用または一時 task> verdict=PASS attempts=1` または同等の dry-run 確認
- [ ] `npm run gate`。重すぎる、または未整備の gate step がある場合は、該当 step と理由を `impl.md` に記録する。
- [ ] `cd sincromisor-frontend && npm run check:md`

## 実行できなかった検証

- 実装時に記録する。

## subagent 成果物

- review: `review.md`
- implementation log: `impl.md`
- evaluation: `eval.md`
- acceptance artifacts: `acceptance/`
