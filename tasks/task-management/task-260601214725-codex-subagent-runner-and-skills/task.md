# TASK-260601214725 Codex subagent runner and skills

## 目的

Claude Code の `.claude/agents` / `/run-task` 相当の役割分離を、Codex subagents と skills で実現する。

## 親タスク

- `TASK-260601214723`

## 変更範囲

- `.agents/skills/sincromisor-task-runner/SKILL.md` を追加する。
- 必要に応じて role-specific skill を追加する。
    - `.agents/skills/task-reviewer/SKILL.md`
    - `.agents/skills/task-implementer/SKILL.md`
    - `.agents/skills/impl-evaluator/SKILL.md`
- `.agents` が `.gitignore` で ignore されているため、`.agents/skills/**` を Git 追跡対象にする unignore ルールを追加するか、追跡可能な別ディレクトリを採用する。
- 親 Codex が subagent を起動する際の入力、成果物、停止条件、再実装ループを定義する。
- reviewer / implementer / evaluator が触ってよいファイル範囲を明文化する。
- `review.md` / `impl.md` / `eval.md` / `acceptance/` / `meta.yaml` / `index.md` を誰がどのコミットに含めるかを定義する。

## 実装方針

- 親 Codex はオーケストレーターとして `meta.yaml` 更新と最終 close を担当する。
- reviewer subagent は `task.md` と関連設計を読み、`review.md` のみを書く。
- implementer subagent は実装、テスト、コミット、`impl.md` 追記を担当し、`meta.yaml` と `eval.md` は触らない。
- evaluator subagent は committed diff と成果物を独立検証し、`eval.md` と必要な `acceptance/` のみを書く。
- evaluator は実装者の自己申告を信用せず、品質ゲートを独立実行する。
- 評価 FAIL の場合は、親 Codex が `eval.md` の残課題を implementer に渡し、最大反復回数内で再実装する。
- Codex subagent の起動は、ユーザーが pipeline / subagent 実行を明示した場合、または `sincromisor-task-runner` skill の利用を明示した場合に限定する。
- 実装 commit と close commit の境界は `tasks/README.md` に明記する。既定案は、implementer が実装差分、テスト、`impl.md` を commit し、parent が `review.md`, `eval.md`, `acceptance/`, `meta.yaml`, `index.md` を含む close commit を作る。

## subagent 境界

```text
parent Codex
  - tasks:set / tasks:index
  - subagent 起動
  - 判定転記
  - close
  - close commit

task-reviewer
  - read: task.md, meta.yaml, AGENTS.md, documents/design, documents/rules, related source
  - write: review.md
  - commit: no

task-implementer
  - read: task.md, review.md, eval.md when retrying
  - write: implementation files, tests, impl.md
  - commit: yes

impl-evaluator
  - read: task.md, review.md, impl.md, git diff/log, implementation files
  - write: eval.md, acceptance/
  - commit: no
```

## 完了条件

- Codex で `sincromisor-task-runner` skill を使うと、review -> implement -> evaluate の手順が明確に実行できる。
- subagent ごとの入力と出力が task directory 内のファイルに限定されている。
- 各 role が禁止されている操作を明確に把握できる。
- 実装前レビュー、実装、独立評価、再実装ループ、close の順序が文書化されている。
- Codex skills の配置先が通常の `git status` で追跡可能になっている。
- subagent 成果物と close 更新のコミット責任が文書化されている。

## 確認

- [x] skill を読んだ Codex が parent runner の役割を説明できる。
- [x] reviewer / implementer / evaluator の各 prompt が独立して実行可能である。
- [x] evaluator が source code を変更しないルールになっている。
- [x] `meta.yaml` を parent 以外が触らないルールになっている。
- [x] `git status --ignored .agents` または採用した配置先の確認で、新規 skill が ignore されないことを確認する。
- [x] 実装 commit と close commit に含める成果物の一覧が `tasks/README.md` または runner skill に明記されている。

## 結果

- `.agents/skills/sincromisor-task-runner/SKILL.md` を追加し、parent Codex の orchestration、停止条件、close 手順、コミット責任を定義した。
- `.agents/skills/task-reviewer/SKILL.md`, `.agents/skills/task-implementer/SKILL.md`, `.agents/skills/impl-evaluator/SKILL.md` を追加し、role ごとの read/write 境界と禁止操作を定義した。
- `.gitignore` に `.agents/skills/**` の unignore ルールを追加し、skill が Git 追跡対象になるようにした。
- `tasks/README.md` に role skill の配置先と pipeline のコミット境界を追記した。
- `git status --ignored --short .agents`, `npm run tasks:index:check`, `npm run check:md` で確認した。
