# tighten task agent source comment quality prompts

## 背景 / 目的

`task-260628231542-character-animation-3-0-phase-13-source-comment-remediation` は review / implementation / evaluation を通過したが、追加コメントは module 要約の定型文に偏り、実コードの symbol / decision を安全に変更するための情報としては弱かった。

現行 agent 文面は、TypeScript production code の comment audit / acceptance を要求しているものの、file 単位の module TSDoc 集約、定型 audit 理由、弱いコメントの削除、実コードとの spot check を十分に止められない。結果として「コメントがあるか」は確認できても、「そのコメントが保守者の変更判断を安全にするか」を判定しづらい。

このタスクでは、`task-260629022214-tighten-typescript-source-comment-quality-rules` で強化した規約を task-reviewer / task-implementer / impl-evaluator のプロンプトへ反映し、同じ失敗を task 定義・実装・評価の各段で止める。

依存:

- `task-260629022214-tighten-typescript-source-comment-quality-rules`

## 完了条件（受け入れ条件）

- [ ] `.claude/agents/task-reviewer.md` を更新し、TypeScript production code のコメント改善タスクで、symbol / decision 単位の comment audit schema が task.md に無い場合は High 指摘にする。
- [ ] `.claude/agents/task-reviewer.md` を更新し、comment acceptance が file 単位の「module comment に集約」「必要情報のいずれか」だけで完了できる場合は High 指摘にする。
- [ ] `.claude/agents/task-reviewer.md` を更新し、コメント改善タスクが 10 file を超える広域一括作業を要求する場合は、slice 分割または symbol-level sampling 方針が task.md に明記されていなければ High 指摘にする。
- [ ] `.claude/agents/task-implementer.md` を更新し、TypeScript production code を変更した場合は、変更対象を `keep` / `rewrite` / `delete` / `add` に分類し、symbol / decision 単位の comment audit を `impl.md` に記録するよう明記する。
- [ ] `.claude/agents/task-implementer.md` を更新し、弱い既存コメントは「追加で補う」だけでなく削除または rewrite する選択肢を持つこと、module TSDoc 一括追加を既定解にしないことを明記する。
- [ ] `.claude/agents/impl-evaluator.md` を更新し、TypeScript production code のコメント変更を評価する場合は、少なくとも 5 symbols / decisions（変更数が 5 未満なら全件）を実コードと照合し、名前・型から分かるだけのコメント、確認先だけのコメント、失敗モードのない heuristic コメント、定型 audit 理由があれば FAIL にする。
- [ ] `tasks/AUTHORING-CHECKLIST.md` の「ソースコードコメント品質」観点を更新し、task.md には symbol / decision 単位の audit schema、module TSDoc 集約の許可条件、既存コメントの delete/rewrite 条件、評価時の spot check 条件を含めるよう明記する。
- [ ] `.agents/CUSTOMIZATIONS.md` を更新し、upstream refresh 時に symbol / decision 単位の comment quality gate と evaluator spot check 条件を維持する必要があると記録する。
- [ ] `npm run gen:codex` を実行し、`.agents/skills/**` と `.codex/agents/*.toml` を `.claude/` 変更から再生成する。
- [ ] 生成物を手書き編集しない。`.agents/skills/**` と `.codex/agents/*.toml` の差分は `npm run gen:codex` によるものに限定する。

## 設計判断（着手前に確定済み）

- 編集正本は `.claude/agents/*.md`、`tasks/AUTHORING-CHECKLIST.md`、`.agents/CUSTOMIZATIONS.md` とする。`.agents/skills/**` と `.codex/agents/*.toml` は生成物なので直接編集しない。
- `task-reviewer` は task.md の仕様品質を見る。実装差分は見ないため、「symbol / decision 単位の audit schema が受け入れ条件にあるか」を High 判定対象にする。
- `task-implementer` は実装者として、変更したコメントの分類と判断理由を `impl.md` に残す。単に「コメントを追加した」と報告するだけでは不可とする。
- `impl-evaluator` は実装者の audit を信用するだけでなく、実コードとコメントを spot check する。評価者が全件読めない場合でも、最低 5 symbols / decisions は実コード照合する。
- `tasks/AUTHORING-CHECKLIST.md` は task-reviewer の評価観点の正本であるため、agent 文面と用語を揃える。

## スコープ境界

- 本タスクでやること:
    - `.claude/agents/task-reviewer.md`
    - `.claude/agents/task-implementer.md`
    - `.claude/agents/impl-evaluator.md`
    - `tasks/AUTHORING-CHECKLIST.md`
    - `.agents/CUSTOMIZATIONS.md`
    - `npm run gen:codex` による `.agents/skills/**` と `.codex/agents/*.toml` の再生成。
- 本タスクでやらないこと:
    - `documents/rules/*.md` の規約本文変更。これは依存タスクの責務。
    - production code のコメント修正。
    - task runner script や lint rule の実装。
    - `.claude/commands/*.md` の変更。コマンド手順ではなく role prompt の品質 gate が対象であるため。

## 実装方針（既存コード整合: file:line）

- `.claude/agents/task-reviewer.md:28` から `:31` はコメント品質観点を定義している。ここへ symbol / decision 単位の audit schema と広域一括作業の High 条件を追加する。
- `.claude/agents/task-reviewer.md:42` から `:50` は NEEDS_REVISION 条件を列挙している。file 単位 TSDoc 集約だけで通る task、定型 audit、弱いコメントの削除方針なしを High 条件に追加する。
- `.claude/agents/task-implementer.md:22` から `:25` は着手前のコメント規約確認を定義している。依存タスクで強化された `documents/rules/coding-ts.md` の symbol / decision 単位方針を読むよう更新する。
- `.claude/agents/task-implementer.md:34` から `:37` は comment audit 実施を定義している。keep/rewrite/delete/add 分類と module TSDoc 一括追加禁止を追加する。
- `.claude/agents/task-implementer.md:58` から `:61` は `impl.md` 記録項目を定義している。symbol / decision、required maintenance knowledge、action を記録するよう更新する。
- `.claude/agents/impl-evaluator.md:40` から `:43` と `:63` から `:66` は comment acceptance の評価条件を定義している。spot check 件数と FAIL 条件を追加する。
- `tasks/AUTHORING-CHECKLIST.md:70` から `:78` はソースコードコメント品質の task acceptance を定義している。agent prompt と同じ用語で更新する。
- `.agents/CUSTOMIZATIONS.md:83` から `:86` は comment quality gate の Sincromisor 固有差分を記録している。symbol / decision audit と evaluator spot check を維持対象として追記する。

## テスト

- `npm run gen:codex`
- `npm run gen:codex:check`
- `npm run tasks:check`
- `npm run tasks:index:check`
- `npm run gate`

## ドキュメント同期の要否

要。agent workflow と task authoring checklist を変更するため、`.claude/agents/*.md`、`tasks/AUTHORING-CHECKLIST.md`、`.agents/CUSTOMIZATIONS.md`、生成物 `.agents/skills/**`、`.codex/agents/*.toml` を同期対象にする。
