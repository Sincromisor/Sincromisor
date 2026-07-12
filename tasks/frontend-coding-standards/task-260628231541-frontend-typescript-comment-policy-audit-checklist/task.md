# frontend TypeScript comment policy and audit checklist

## 背景 / 目的

現行の TypeScript 規約は `documents/rules/coding-ts.md:152` で「ソースコード内コメントは日本語」と定めているが、どの export / 境界 / heuristic にコメントを必須とするかを定義していない。`documents/rules/coding-ts.md:54` では catch の理由コメント、`documents/rules/coding-ts.md:133` では TODO の形式だけが局所的に定義されている。

その結果、巨大ファイル分割後も `sincromisor-frontend/src/features/gaze/trackingRuntime/*.ts`、`sincromisor-frontend/src/character/motionIntent/*.ts`、`sincromisor-frontend/src/character/motionEvaluation/*.ts`、`sincromisor-frontend/src/pages/motionDebug/*.ts` に export / schema / fallback / threshold が多数ある一方で、コメント品質をレビュー可能な基準がない。

このタスクでは TypeScript コメント品質の基準と、起票時にコメント要件を明記させるチェックリストを正本化する。

## 完了条件（受け入れ条件）

- [ ] `documents/rules/coding-ts.md` に新しい節 `## 13. ソースコードコメント品質` を追加する。既存節番号は変更しない。
- [ ] 新節は、コメントの目的を「読めば分かる処理説明」ではなく「公開 API、境界、非自明な判断、制約理由、保存 contract を後続の開発者が安全に変更するための文脈」と定義する。
- [ ] 新節は、少なくとも次の対象にコメントを必須とする。
    - `export` される、または public な class / function / type / interface / component / hook / module / domain-significant `const`
    - `schemaVersion` を持つ保存 contract / replay log / debug snapshot / parser
    - Worker / DOM / MediaStream / MediaPipe / WebRTC / filesystem / replay log などの境界 module
    - coordinate system、単位、左右定義、時刻基準、frame index、confidence / reliability の意味
    - threshold、fallback、degradation、recovery、cooldown、hysteresis、clamp、side assignment、ROI 判定などの heuristic
    - cleanup 所有者、resource lifecycle、例外を fallback に落とす理由
- [ ] 新節は、export / public API のコメントは原則 JSDoc / TSDoc とし、実装内部の補足コメントとは使い分けることを定義する。受け入れる記法と記述例は `AGENTS.md` の基本原則と矛盾させない。
- [ ] 新節は、コメントに最低限含める内容を対象別に定義する。例: public export は「責務・入力境界・返す値または observable output の意味・失敗条件・副作用・非対象」、heuristic は「値の意味・採用理由・変更時の確認先」、schema parser は「受理する旧 log / reject する値 / fallback 方針」。
- [ ] 新節は、実装コメントを許容する対象を、複雑な分岐、アルゴリズム、workaround、性能理由、外部仕様による制約、invariant に限定することを定義する。
- [ ] 新節は、禁止するコメントを定義する。例: `// 値を返す` のような処理説明だけのコメント、古い実装経緯だけのコメント、根拠のない「temporary」、理由・削除条件・canonical task/issue ID・期限または判断基準がない TODO、実装と同期しない設計メモ、更新されず stale になったコメント。
- [ ] コメントを省略できる条件を一意に定義する。候補は「private helper で名前・型・周辺 public コメントから責務が明らか、かつ境界 / heuristic / lifecycle / schema を持たない場合」に限定する。
- [ ] `tasks/AUTHORING-CHECKLIST.md` に「ソースコードコメント品質」観点を追加し、TypeScript production code を変更する task は comment audit / comment acceptance を task.md の受け入れ条件へ含める必要があると明記する。
- [ ] `AGENTS.md` の作業原則にあるコメント方針が新しい `documents/rules/coding-ts.md` 節へ誘導するよう、正本リンクまたは参照文を更新する。
- [ ] `documents/rules/code-structure.md` の「コメントで段落分けしたくなったら関数抽出」方針と矛盾しないことを明記する。コメントは分割の代替ではなく、境界と理由を伝える補助であり、まず命名・関数分割・型定義・options object で明確化できないか確認すると書く。

## 設計判断（着手前に確定済み）

- コメント品質の正本は `documents/rules/coding-ts.md` に置く。TypeScript 固有の export / schema / Worker / DOM / MediaPipe 境界を扱うため、横断的な `code-structure.md` ではなく TS 規約へ追加する。
- 節番号は `## 13` として末尾追加にする。既存節を renumber すると過去タスク・レビュー指摘の参照が不要に揺れるため。
- 定量基準は「コメント行数 / コード行数」ではなく対象ベースにする。行数比は無意味なコメントを誘発し、今回の問題である「重要な判断に理由がない」を検出できないため。
- comment audit はタスク起票・実装・評価で使う観点として `tasks/AUTHORING-CHECKLIST.md` にも追加する。coding-ts だけでは task-reviewer が受け入れ条件欠落を High 指摘しにくいため。
- 外部境界はドキュメントだけである。コード生成や agent 更新は後続タスクで扱う。

## スコープ境界

- 本タスクでやること:
    - TypeScript コメント品質ルールの正本化。
    - 起票チェックリストへの comment acceptance 観点追加。
    - AGENTS / code-structure との導線整理。
- 本タスクでやらないこと:
    - production code のコメント追加。
    - task-reviewer / implementer / evaluator agent の文面変更。
    - コメント audit script の実装。
    - Biome / ESLint rule の追加。
- 後続タスクとの境界:
    - agent 調整タスクは本タスクの新ルールを読み、レビュー / 実装 / 評価 agent の判定基準へ反映する。
    - source comment remediation タスクは本タスクの新ルールに従って実コードを補強する。

## 実装方針（既存コード整合: file:line）

- `documents/rules/coding-ts.md:152` はコメントの言語だけを定めており、品質・必須対象を定めていない。新節はこの不足を補う。
- `documents/rules/coding-ts.md:54` は catch のコメント、`documents/rules/coding-ts.md:133` は TODO 形式を定めている。新節はこれらを上書きせず、コメント品質の総則として参照する。
- `documents/rules/code-structure.md:29` は「コメントで段落分けしたくなったら関数抽出」を定めている。新節では、コメントを責務分割の代替にしないことを明記する。
- `tasks/AUTHORING-CHECKLIST.md:15` 以降は受け入れ条件、設計判断、既存コード整合、テスト、ドキュメント同期をレビュー観点にしているが、source comment quality の観点がない。新観点を追加する。
- `AGENTS.md` は、コメントを「公開 API、境界、非自明な判断、制約理由」を中心に、後続保守者が安全に変更するための文脈として書く方針を定めている。詳細正本を新節へ委譲しつつ、JSDoc / TSDoc、失敗条件、副作用、TODO 必須情報、stale comment 更新、命名・分割・型による明確化を弱めない。

## テスト

- `npm run tasks:check`
- `npm run tasks:index:check`
- `cd sincromisor-frontend && npm run check`
- Markdown 整形が必要な場合は `cd sincromisor-frontend && npm run format:md` を実行し、差分を確認する。

## ドキュメント同期の要否

要。コメント品質ルールそのものを変更するため、`documents/rules/coding-ts.md`、`documents/rules/code-structure.md`、`tasks/AUTHORING-CHECKLIST.md`、`AGENTS.md` を同期対象にする。
