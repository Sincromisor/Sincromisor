# task agents comment quality gates

## 背景 / 目的

コメント品質の不足は、実装タスクが完了しても reviewer / evaluator が十分に差し戻せなければ再発する。現行の `task-reviewer` は `tasks/AUTHORING-CHECKLIST.md` を参照するが、`.claude/agents/task-reviewer.md:20` 以降の評価観点には source comment acceptance がない。`task-implementer` は `.claude/agents/task-implementer.md:18` で規約確認を求めるが、コメント audit の実行・記録を明示していない。`impl-evaluator` も `.claude/agents/impl-evaluator.md:36` 以降で受け入れ条件とドキュメント整合を確認するが、コメント品質を独立に見る指示がない。

このタスクでは、コメント品質ルールを task-reviewer / task-implementer / impl-evaluator の各 agent workflow に組み込み、同じ問題を「タスク定義」「実装」「評価」の各段で止められるようにする。

依存:

- `task-260628231541-frontend-typescript-comment-policy-audit-checklist`

## 完了条件（受け入れ条件）

- [ ] `.claude/agents/task-reviewer.md` を更新し、TypeScript production code を変更する task で comment audit / comment acceptance が task.md に無い場合は High 指摘にする、と明記する。
- [ ] `task-reviewer` の High 指摘条件に、次を追加する。
    - public export / boundary / heuristic / schema / lifecycle を変更するのに、コメント追加・更新・省略理由の受け入れ条件がない。
    - 「コメントを追加する」とだけ書かれ、対象・期待内容・検証方法が一意でない。
    - 大規模 refactor / module split task で、新旧 module の責務境界コメントの扱いが未定義。
- [ ] `.claude/agents/task-implementer.md` を更新し、TypeScript production code を変更する場合は `documents/rules/coding-ts.md` のコメント品質節を読み、変更した export / boundary / heuristic の comment audit 結果を `impl.md` に記録するよう明記する。
- [ ] `.claude/agents/impl-evaluator.md` を更新し、TypeScript production code を変更した実装では、コメント品質の受け入れ条件を実装差分と照合し、不足していれば FAIL にするよう明記する。
- [ ] `tasks/AUTHORING-CHECKLIST.md` の comment quality 観点と agent 文面の用語を揃える。用語は `public export`、`boundary`、`heuristic`、`schema/parser`、`lifecycle`、`省略理由` に固定する。
- [ ] `.agents/CUSTOMIZATIONS.md` に、Sincromisor 固有の agent comment quality gate を upstream refresh 時に維持する必要があると追記する。
- [ ] `npm run gen:codex` を実行し、`.agents/skills/**` と `.codex/agents/*.toml` を `.claude/` 変更から再生成する。
- [ ] `npm run gen:codex:check` が成功する。
- [ ] 生成物を手書き編集しない。`.codex/agents/task-reviewer.toml` などは `gen:codex` の出力として更新する。

## 設計判断（着手前に確定済み）

- 編集正本は `.claude/agents/*.md` とする。`.codex/agents/*.toml` は生成物であり、`.codex/agents/task-reviewer.toml:1` にも直接編集禁止が書かれているため。
- task-reviewer だけでなく task-implementer / impl-evaluator も更新する。reviewer だけを強化しても、実装中の audit 記録や評価時の FAIL 条件が弱ければ同じ漏れが再発するため。
- agent はコメントの量を数えない。`documents/rules/coding-ts.md` の対象ベース基準に沿って、必要対象への説明有無と省略理由を確認する。
- agent 更新後は `npm run gen:codex` を必須にする。Codex セッションは `.codex/agents/*.toml` と `.agents/skills/**` を読むため、`.claude/` だけを変えると実運用に反映されない。
- 外部境界はローカル生成スクリプトだけである。network、LLM、DB、外部 API は使わない。

## スコープ境界

- 本タスクでやること:
    - task-reviewer / task-implementer / impl-evaluator の comment quality gate 追加。
    - Codex 生成物の再生成。
    - CUSTOMIZATIONS への upstream refresh 注意点追記。
- 本タスクでやらないこと:
    - production code のコメント追加。
    - TypeScript コメント規約そのものの設計。
    - task runner の実装変更。
    - 新しい lint rule / static analysis の追加。
- 依存タスクとの境界:
    - コメント規約タスクが正本ルールと checklist を定義する。本タスクはそのルールを agent workflow に接続する。

## 実装方針（既存コード整合: file:line）

- `.claude/agents/task-reviewer.md:20` 以降は評価観点、`:33` 以降は NEEDS_REVISION 条件を定義している。comment acceptance 欠落の High 条件はここへ追加する。
- `.claude/agents/task-implementer.md:24` 以降は実装手順、`:41` 以降は `impl.md` 作業ログ方針を定義している。comment audit の実施と記録はこの周辺へ追加する。
- `.claude/agents/impl-evaluator.md:36` 以降は評価手順、`:56` 以降はカバレッジ不足を FAIL とする方針を定義している。コメント品質の受け入れ条件照合をここへ追加する。
- `.agents/CUSTOMIZATIONS.md:80` 以降は generated Codex artifacts の upstream 差分を記録している。comment quality gate の維持注意を追加する。
- `package.json:18` と `package.json:19` は `gen:codex` / `gen:codex:check` script を定義している。生成と検証はこれを使う。

## テスト

- `npm run gen:codex`
- `npm run gen:codex:check`
- `npm run tasks:check`
- `npm run tasks:index:check`

## ドキュメント同期の要否

要。agent workflow と生成物を変更するため、`.claude/agents/*.md`、`.codex/agents/*.toml`、必要に応じて `.agents/skills/**`、`.agents/CUSTOMIZATIONS.md` を同期する。
