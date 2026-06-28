# character animation 3.0 phase 13 source comment remediation

## 背景 / 目的

Phase 12 の分割により `trackerRuntime.ts` や `motionDebugApp.ts` は小さくなったが、コメント品質はまだ十分ではない。現行棚卸しでは、対象周辺だけで `export class/function/type/interface/const` が約 417 件あり、`sincromisor-frontend/src/features/gaze/trackingRuntime/*.ts`、`sincromisor-frontend/src/character/motionIntent/*.ts`、`sincromisor-frontend/src/character/motionEvaluation/*.ts`、`sincromisor-frontend/src/pages/motionDebug/*.ts` にはコメント 0 行の module が多数残っている。

このタスクでは、新しいコメント品質規約と agent gate を前提に、motion / tracking / motion-debug 周辺の public export、boundary、heuristic、schema/parser、lifecycle のコメントを棚卸しし、必要な説明を実コードへ追加する。

依存:

- `task-260628231541-frontend-typescript-comment-policy-audit-checklist`
- `task-260628231541-task-agents-comment-quality-gates`

## 完了条件（受け入れ条件）

- [ ] `tasks/character-sincro-motion/task-260628231542-character-animation-3-0-phase-13-source-comment-remediation/artifacts/comment-audit.md` を作成し、対象 file ごとに comment audit を記録する。
- [ ] comment audit は最低限、`path`、`exports checked`、`boundary/heuristic/schema/lifecycle targets`、`comments added/updated`、`omitted with reason`、`remaining risk` の列を持つ Markdown table にする。
- [ ] audit 対象は次の production `.ts` file に固定する。
    - `sincromisor-frontend/src/features/gaze/trackingRuntime/*.ts`
    - `sincromisor-frontend/src/character/motionIntent/*.ts`
    - `sincromisor-frontend/src/character/motionEvaluation/*.ts`
    - `sincromisor-frontend/src/pages/motionDebug/*.ts`
- [ ] audit 対象から `**/__tests__/**`、`*.test.ts`、fixture / acceptance 用 `.ts`、生成物ではない task artifact を除外する。除外した path pattern は `comment-audit.md` の冒頭に明記する。
- [ ] `main.ts`、`dom.ts` のような薄い entry / DOM helper も audit 対象に含めるが、コメント省略可なら audit に理由を書く。
- [ ] 各対象 file の `export` される、または public な class / function / type / interface / component / hook / module / domain-significant `const` に、責務・入力境界・返す値または observable output の意味・失敗条件・副作用・非対象のいずれか必要な情報がコメントまたは近接する module comment で説明されていることを確認する。
- [ ] export / public API のコメントは原則 JSDoc / TSDoc とし、省略または module comment へ集約する場合は `comment-audit.md` に理由を書く。
- [ ] schemaVersion を持つ保存 contract、Zod parser、replay log parser、debug snapshot parser には、受理する値、reject する値、旧 log / fallback 方針を説明するコメントを追加または更新する。
- [ ] Worker / DOM / MediaStream / MediaPipe / replay log / VRM scene / window debug API に接する module には、所有する resource、cleanup 責務、持ち込まない責務を説明する module comment または public export comment を追加する。
- [ ] threshold、fallback、degradation、recovery、cooldown、hysteresis、clamp、ROI、side assignment、coordinate mapping、時刻基準のうち対象 file に存在するものは、なぜその判断をするか、変更時に確認すべきテスト / design doc をコメントで説明する。
- [ ] コメントは日本語で書く。ただし schemaVersion、API 名、enum 値、metric key、technical term は英語のままでよい。
- [ ] 実装コメントは、複雑な分岐、アルゴリズム、workaround、性能理由、外部仕様による制約、invariant の説明に限定する。
- [ ] `// 値を返す` のような処理説明だけのコメント、実装と同期しない経緯コメント、更新されず stale になったコメント、理由・削除条件・canonical task/issue ID・期限または判断基準がない TODO は追加しない。
- [ ] コメント追加に伴って責務混在が見つかった場合は、コメントで覆い隠さず、`impl.md` に「分割すべき follow-up」として file / 理由 / 推奨 task 化単位を記録する。命名・関数分割・型定義・options object で明確にすべき箇所も、挙動変更禁止の範囲を超える場合は follow-up として記録する。
- [ ] 挙動変更をしない。production code の runtime logic、type shape、schemaVersion、threshold 値、export 名は変更しない。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` の既存記述と矛盾するコメントを追加しない。矛盾を見つけた場合は、実装コメントではなく design doc 同期の要否を `impl.md` に記録する。

## 設計判断（着手前に確定済み）

- 対象範囲は motion / tracking / motion-debug 周辺に限定する。全 frontend のコメント補強を 1 タスクで扱うと過大になり、レビューも評価も散漫になるため。
- audit artifact を必須にする。単にコメントを追加するだけでは「何を見て、何を省略したか」が残らず、再発防止にならないため。
- コメントは対象ベースで確認し、コメント行数比は使わない。行数比は無意味なコメントを増やし、重要な boundary / heuristic の説明欠落を見逃すため。
- 省略理由は audit に残す。private helper や薄い re-export まで機械的にコメントするとノイズになるため、必要な説明と省略の判断を分けて追跡する。
- 挙動変更は禁止する。コメント品質改善タスクで runtime logic を動かすと検証範囲が広がり、コメント不足の改善がまた埋もれるため。

## スコープ境界

- 本タスクでやること:
    - 対象 production `.ts` file の comment audit。
    - public export / boundary / heuristic / schema / lifecycle コメントの追加・更新。
    - 省略理由と follow-up 候補の記録。
- 本タスクでやらないこと:
    - runtime behavior の変更。
    - schemaVersion / type shape / threshold の変更。
    - module split / large refactor。
    - コメント品質 lint rule の追加。
    - frontend 全域のコメント補強。
- 依存タスクとの境界:
    - コメント規約タスクが品質基準を定義する。
    - agent gate タスクが実装・評価でコメント品質を見落とさない workflow を定義する。
    - 本タスクはその基準を motion / tracking / motion-debug の実コードへ適用する。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:1` 付近は TrackerRuntime facade だが、コメント行数は少なく、DOM / video / Worker 所有境界の説明を確認対象にする。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy.ts:1` 付近は ordered degradation policy を扱うが、現状コメントがほぼない。stage 進行 / recovery / cadence の理由を確認対象にする。
- `sincromisor-frontend/src/character/motionIntent/motionIntentEstimatorConfig.ts:1` 付近は timing / threshold default を扱うが、コメントがない。threshold と clamp の意味を確認対象にする。
- `sincromisor-frontend/src/character/motionEvaluation/motionMetricSummary.ts:55` 付近は metric summary の責務コメントがあるが、threshold 判定・not_available 方針・metric key 順序の説明を確認対象にする。
- `sincromisor-frontend/src/pages/motionDebug/types.ts:1` 付近は `MotionDebugApi` を含む developer-visible 型群だが、コメントがない。window debug API / replay / metrics の公開面を確認対象にする。
- `documents/design/frontend/character/tracking.md` は TrackerRuntime / ROI / degradation の正本であり、`documents/design/frontend/character/motion.md` は motion-debug / metrics / intent / replay の正本である。コメントはこれらと矛盾させない。

## テスト

- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run test -- trackerRuntime`
- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`
- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `npm run tasks:check`
- `npm run tasks:index:check`

## ドキュメント同期の要否

原則不要。production behavior / public contract は変更せず、既存 design doc と実装コメントの整合を取るだけの内部品質改善である。ただし、コメント作成中に design doc と実装の矛盾を見つけた場合は、同タスクで無理に設計変更せず `impl.md` に同期が必要な follow-up として具体的に記録する。
