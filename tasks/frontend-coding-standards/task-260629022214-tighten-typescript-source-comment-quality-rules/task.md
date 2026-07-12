# tighten TypeScript source comment quality rules

## 背景 / 目的

`task-260628231542-character-animation-3-0-phase-13-source-comment-remediation` では、コメント品質改善のために 90 production `.ts` file へ module TSDoc が追加された。しかし実装ログでは「production code は先頭 module TSDoc の追加に限定」とされ、個別 export の TSDoc は file 単位の module comment へ集約された。

その結果、コメントは「module が何を担当するか」の要約に寄り、AGENTS.md が求める「未来の保守者が安全に変更するために必要だが、コードだけでは分からない情報」まで届いていない。特に、symbol / decision 単位の要否判定、既存コメントの削除判断、module TSDoc 集約の許可条件、heuristic の失敗モード記述、評価時の実コード照合が弱い。

このタスクでは `documents/rules/*.md` のコメント品質ルールを、前回の失敗パターンを防げる粒度に改訂する。

## 完了条件（受け入れ条件）

- [ ] `documents/rules/coding-ts.md` の `## 13. ソースコードコメント品質` を更新し、コメント作業の目的を「コメントを追加する」ではなく、対象を `keep` / `rewrite` / `delete` / `add` に分類して必要な保守知識だけを残す作業として定義する。
- [ ] `documents/rules/coding-ts.md` に、comment audit の最小単位を file ではなく symbol / decision とすることを明記する。対象は public export、schema/parser、保存 contract、threshold/heuristic、fallback、lifecycle/cleanup、coordinate/time basis、boundary module の公開面とする。
- [ ] `documents/rules/coding-ts.md` に、comment audit artifact の標準列を定義する。列は最低限 `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` とし、file 単位の「module comment に集約」だけでは完了扱いにしない。
- [ ] `documents/rules/coding-ts.md` に、module TSDoc へ集約できる条件を定義する。許可条件は、file 内の public export が単一責務であり、module comment が各 export の入力境界、observable output、失敗条件、副作用、非対象を具体的に覆う場合に限定する。
- [ ] `documents/rules/coding-ts.md` に、禁止または FAIL 相当のコメント例を追加する。少なくとも「design doc / focused tests を確認する」とだけ書くコメント、名前・型から分かる責務要約だけのコメント、実コード上の失敗モードを説明しない heuristic コメント、定型文だけの audit 理由を含める。
- [ ] `documents/rules/coding-ts.md` の heuristic / threshold / lifecycle / parser の最低要件を強める。heuristic は誤調整時の見え方または失敗モード、threshold は値の意味と根拠または由来、parser は caller に返る失敗の形、lifecycle は resource owner と解放不変条件を要求する。
- [ ] `documents/rules/code-structure.md` を更新し、コメント改善中に責務混在、命名不足、型不足、関数分割不足を見つけた場合はコメントで覆わず、同タスク内で直すか follow-up として symbol / 理由 / 推奨分割単位を記録する方針を明記する。
- [ ] `documents/rules/*.md` 以外は変更しない。ただし task artifact、review/eval/impl、生成 index はこのタスク運用上の変更として許可する。
- [ ] TypeScript production code は変更しない。

## 設計判断（着手前に確定済み）

- 正本の主対象は `documents/rules/coding-ts.md` とする。TypeScript の public export、schema/parser、Worker/DOM/MediaPipe 境界、heuristic を扱うため、詳細ルールは TS 規約へ置く。
- `documents/rules/code-structure.md` は横断ルールとして、コメントが責務分割の代替ではないことと、コメント改善時の follow-up 記録義務だけを扱う。
- `AGENTS.md` は本タスクでは変更しない。既に詳細基準を `documents/rules/coding-*.md` へ委譲しており、今回の修正対象はユーザー指定どおり `documents/rules/*.md` に限定する。
- `tasks/AUTHORING-CHECKLIST.md` とサブエージェント文面は後続の `task-260629022219-tighten-task-agent-source-comment-quality-prompts` で更新する。本タスクは規約正本の語彙と判定基準を先に確定する。
- コメント行数比や「全 file に TSDoc があるか」は採用しない。前回の問題は量ではなく、保守判断に必要な情報が symbol / decision 単位で不足したことだからである。

## スコープ境界

- 本タスクでやること:
    - `documents/rules/coding-ts.md` のコメント品質節の改訂。
    - `documents/rules/code-structure.md` のコメントと責務分割の関係の補強。
- 本タスクでやらないこと:
    - `.claude/agents/*.md`、`.agents/skills/**`、`.codex/agents/*.toml` の更新。
    - `tasks/AUTHORING-CHECKLIST.md` の更新。
    - production code のコメント修正。
    - コメント品質 lint rule の実装。
- 依存タスクとの境界:
    - 後続 agent prompt タスクは、本タスクで確定した用語をサブエージェントのレビュー / 実装 / 評価手順へ接続する。
    - 後続 remediation タスクは、本タスクと agent prompt タスクの基準を使って実コードコメントを直す。

## 実装方針（既存コード整合: file:line）

- `documents/rules/coding-ts.md:172` から `:177` はコメントの目的と責務分割の関係を定義している。ここへ keep/rewrite/delete/add と symbol / decision 単位の方針を追加する。
- `documents/rules/coding-ts.md:179` から `:190` はコメント必須対象を列挙している。ここは対象列挙を維持しつつ、audit の最小単位を file ではなく対象 symbol / decision にする。
- `documents/rules/coding-ts.md:215` から `:227` は対象別の最低内容を表で定義している。heuristic、threshold、parser、lifecycle の具体要件をここで強める。
- `documents/rules/coding-ts.md:229` から `:233` はコメント省略条件を定義している。module TSDoc 集約の許可条件を別項目として追加し、public export の省略条件とは混同しない。
- `documents/rules/coding-ts.md:248` から `:255` は禁止コメントを定義している。前回出た「確認先だけ」「責務要約だけ」「定型 audit」を禁止例に追加する。
- `documents/rules/code-structure.md:30` から `:32` はコメントと責務分割の関係を定義している。コメント改善中に構造問題を見つけた場合の扱いをここへ追記する。

## テスト

- `npm run tasks:check`
- `npm run tasks:index:check`
- `npm run gate`

## ドキュメント同期の要否

要。コメント品質ルールそのものを変更するため、同期対象は `documents/rules/coding-ts.md` と `documents/rules/code-structure.md` とする。AGENTS.md、tasks checklist、agent prompts は本タスクでは変更せず、後続タスクで同期する。
