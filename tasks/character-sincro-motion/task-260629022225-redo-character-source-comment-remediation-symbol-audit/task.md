# redo character source comment remediation with symbol audit

## 背景 / 目的

`task-260628231542-character-animation-3-0-phase-13-source-comment-remediation` では、motion / tracking / motion-debug 周辺の 90 production `.ts` file に module TSDoc が追加された。しかし追加コメントは、file 単位の責務要約や「design doc / focused tests を確認する」という一般論に寄り、threshold、parser、lifecycle、fallback などの変更時に保守者が必要とする具体的な判断材料が不足している。

実装ログでも、挙動変更禁止を守るため production code は先頭 module TSDoc の追加に限定したと記録されている。評価は 90 file への module TSDoc 追加、file 単位の audit table、代表ファイルの spot check で PASS しており、symbol / decision 単位の保守知識までは検証していない。

このタスクでは、前回追加されたコメントのうち高リスクな motion / tracking / motion-debug の代表 10 file を対象に、既存コメントを `keep` / `rewrite` / `delete` / `add` で分類し、必要なコメントだけを symbol / decision 単位で修正する。目的はコメント量を増やすことではなく、弱いコメントを削り、保守者が安全に変更できる情報へ置き換えることである。

依存:

- `task-260629022214-tighten-typescript-source-comment-quality-rules`
- `task-260629022219-tighten-task-agent-source-comment-quality-prompts`

## 完了条件（受け入れ条件）

- [ ] `tasks/character-sincro-motion/task-260629022225-redo-character-source-comment-remediation-symbol-audit/artifacts/symbol-comment-audit.md` を作成し、対象 file 内の public export、schema/parser、threshold/heuristic、fallback、lifecycle/cleanup、coordinate/time basis、boundary decision を symbol / decision 単位で記録する。
- [ ] audit table は最低限 `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` の列を持つ。
- [ ] audit の `decision` は `keep`、`rewrite`、`delete`、`add` のいずれかに限定する。`rewrite` / `add` では、名前・型からは分からない保守知識を `required maintenance knowledge` に具体化する。
- [ ] 次の 10 file を対象にする。
    - `sincromisor-frontend/src/character/motionIntent/motionIntentEstimatorConfig.ts`
    - `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy.ts`
    - `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeWorkerPipeline.ts`
    - `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts`
    - `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeVideoElement.ts`
    - `sincromisor-frontend/src/character/motionEvaluation/motionMetricThresholds.ts`
    - `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts`
    - `sincromisor-frontend/src/character/motionEvaluation/motionDebugRecorderCompression.ts`
    - `sincromisor-frontend/src/pages/motionDebug/motionDebugReplayRuntime.ts`
    - `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts`
- [ ] 前回追加された file 先頭 module TSDoc は、対象 file ごとに `keep` / `rewrite` / `delete` を判定する。責務要約だけで保守知識がない場合は `delete` または `rewrite` とし、そのまま残さない。
- [ ] module TSDoc へ説明を集約する場合は、対象 file の public export が単一責務であることと、module comment が各 export の入力境界、observable output、失敗条件、副作用、非対象を具体的に覆うことを audit に記録する。
- [ ] threshold / heuristic のコメントは、値の意味、採用理由または由来、誤調整時の見え方または失敗モード、確認すべき focused test / fixture を含める。単に「design doc と tests を確認する」と書くだけのコメントは禁止する。
- [ ] parser / schema のコメントは、受理する version、旧 log / optional slot の扱い、reject 条件、fallback 方針、caller に返る失敗の形を含める。
- [ ] lifecycle / cleanup のコメントは、resource owner、解放タイミング、二重起動・二重解放・callback 漏れを避ける不変条件、失敗時 fallback を含める。
- [ ] 名前・型・関数分割で自明にできる箇所は、コメントで覆わず、同タスク内で挙動を変えない範囲の rename / private helper 抽出を行うか、`impl.md` に follow-up として `path`、`symbol`、`理由`、`推奨 task 化単位` を記録する。
- [ ] runtime behavior、type shape、schemaVersion、threshold 値、export 名、公開 API は変更しない。許可する production code 変更はコメントの追加・更新・削除と、挙動を変えない private な命名・分割に限る。
- [ ] `work/sample-comments.txt` は入力資料として扱い、更新しない。

## 設計判断（着手前に確定済み）

- 対象は 10 file に固定する。前回の 90 file 一括対応が file 単位の定型コメントを誘発したため、本タスクでは広域網羅より高リスク slice の品質を優先する。
- audit の最小単位は file ではなく symbol / decision とする。file 単位の「exports checked」「module comment に集約」は前回と同じ逃げ道になるため採用しない。
- コメントを増やすことを成功条件にしない。弱い module TSDoc を削除し、必要な public export / threshold / parser / lifecycle にだけ移す変更も成功とする。
- TypeScript production code の挙動は変えない。ただし、コメントで補う前に命名・分割で自明にすべき箇所を見つけた場合、private な rename / helper 抽出は許可し、公開 API や threshold 値には触れない。
- design doc 本文は原則変更しない。コメント修正中に design doc と実装の矛盾を見つけた場合は、コメントで隠さず `impl.md` に follow-up として記録する。

## スコープ境界

- 本タスクでやること:
    - 10 file の既存追加コメントの品質判定。
    - symbol / decision 単位の audit artifact 作成。
    - 必要なコメントの rewrite / delete / add。
    - コメントで覆うべきでない構造問題の follow-up 記録。
- 本タスクでやらないこと:
    - 90 file 全体の再 remediation。
    - runtime behavior、schemaVersion、threshold 値、export 名の変更。
    - design doc 本文の同期。
    - コメント品質 lint rule の実装。
    - `work/sample-comments.txt` の更新。
- 依存タスクとの境界:
    - 依存 rules タスクが comment audit / acceptance の正本を定義する。
    - 依存 agent prompt タスクが review / implementation / evaluation の判定基準を更新する。
    - 本タスクはそれらの基準を実コードの代表 slice に適用する。

## 実装方針（既存コード整合: file:line）

- `tasks/character-sincro-motion/task-260628231542-character-animation-3-0-phase-13-source-comment-remediation/impl.md:22` から `:23` は、前回実装が先頭 module TSDoc 追加に限定され、個別 export TSDoc を module comment へ集約したことを記録している。本タスクはこの判断を再評価する。
- `tasks/character-sincro-motion/task-260628231542-character-animation-3-0-phase-13-source-comment-remediation/impl.md:34` から `:37` は、前回 audit が file 単位であったことを記録している。本タスクでは symbol / decision 単位へ変える。
- `tasks/character-sincro-motion/task-260628231542-character-animation-3-0-phase-13-source-comment-remediation/eval.md:13` から `:17` は、前回評価が production `.ts` 90 file の module TSDoc 追加と代表 spot check を PASS としたことを示している。本タスクでは少数 file の全対象 symbol / decision を読む。
- `sincromisor-frontend/src/character/motionIntent/motionIntentEstimatorConfig.ts:1` から `:4` は、threshold 変更時の確認先だけを示す module TSDoc である。`DEFAULT_CONFIG` の threshold / timing 値（同 file `:25` から `:60`）に対し、値の意味、誤調整時の見え方、fixture / test 根拠が必要か判定する。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy.ts:1` から `:4` は、degradation policy の確認先だけを示す module TSDoc である。`TrackerRuntimeDegradationStage`（同 file `:23` から `:30`）と controller lifecycle（同 file `:97` 以降）に対し、stage 順序、hysteresis、fallback の失敗モードを説明すべきか判定する。
- `sincromisor-frontend/src/character/motionEvaluation/motionMetricThresholds.ts:1` から `:4` は threshold の公開挙動を説明しているが、各 metric group の値の由来と誤調整時の QA 判定への影響は限定的である。既存の `DEFAULT_MOTION_METRIC_THRESHOLDS` と近接コメントを symbol / decision 単位で見直す。
- `work/sample-comments.txt:1` 以降は前回追加コメントの抜粋である。対象 10 file のコメント候補を確認する入力資料として使うが、正本は実コードとする。

## テスト

- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run test -- trackerRuntime`
- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`
- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `npm run tasks:check`
- `npm run tasks:index:check`
- `npm run gate`

## ドキュメント同期の要否

原則不要。production behavior、public API、schemaVersion、threshold 値は変更しないため、設計本文の同期は不要とする。ただしコメント見直し中に design doc と実装の矛盾を見つけた場合は、設計本文を同タスクで無理に直さず、`impl.md` に follow-up として具体的な同期先と理由を記録する。
