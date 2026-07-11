# Diagnose and correct temporal arm reach clamp semantics

<!--
  起票の入口は /new-task（起票 + 独立レビューを一括）。既存 task.md を後から再レビューする
  場合は /review-task <task-dir> を使う。いずれも APPROVED を得てから /run-task に渡す。
  各節は tasks/AUTHORING-CHECKLIST.md（task-reviewer 評価観点の正本）に対応する。
  初回 NEEDS_REVISION の最頻出根拠は「設計判断の未確定」と「ドキュメント同期要否の未記載」。
-->

## 背景 / 目的

`task-260705214026-canonical-temporal-arm-solver-production` の実写比較では、temporal primary の `arms-cross` だけ `solverReachClampOccupancy` が Pose fallback の `0.6485507246` から `0.8731343284` へ増えた。一方、既存 P0 baseline は複数 fixture で occupancy がほぼ `1.0` であり、既定 threshold の fail `0.4` とも整合しない。現状の occupancy は「見た目のreach破綻」と「bridge / solver間の二重clampや尺度差」を区別できない。

本タスクでは temporal bridge から IK solver までの clamp 意味論を一意にし、clamp前の超過量を観測可能にしたうえで、`arms-cross` の回帰が座標・尺度・metricのどこに起因するかを特定して修正する。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] Phase 6 arm snapshot に optional `reach` を追加する。schema は `{ requestedReachRatio: number; appliedReachRatio: number; excessReachRatio: number; clampedBy: "bridge" | "solver" | "none" }` に固定し、全 number は finite、`excessReachRatio = max(0, requestedReachRatio - appliedReachRatio)` とする。旧 log の `reach` 欠損は parse success を維持する。
- [ ] temporal bridge は clamp 前後の肩local wrist長から requested / applied ratio を算出し、solverへ渡すtargetとdebug snapshotの値を一致させる。arm lengthが非finiteまたは0以下の場合は既存 `invalid_temporal_arm` fallbackを維持し、偽の0 ratioを保存しない。
- [ ] solver側の再clampが発生した場合は `clampedBy: "solver"`、bridgeだけでclampされた場合は `"bridge"`、どちらも無ければ `"none"` として保存し、同一frameを二重件数として数えない。
- [ ] `solverReachClampOccupancy` の既存keyと旧log計算を維持し、新規診断metricとして `solverExcessReachRatioP95` を追加する。全arm-frameにfinite `reach.excessReachRatio` がある場合だけ左右arm-frame全体のp95を返す。1件でも `reach` 欠損、non-finite、またはsample 0件なら部分sampleで計算せず、`not_available` / `unavailableReason: "reach_diagnostics_not_recorded"` を返す。
- [ ] canonical input `tasks/character-sincro-motion/task-260705214026-canonical-temporal-arm-solver-production/artifacts/video/arms-cross.browser.mp4` の同一bytesを最低3回 replayし、各runについて入力SHA-256、左右別の requested/applied/excess ratio、`clampedBy`内訳、temporal source stateをartifactに保存する。修正後は3 runすべてで `solverExcessReachRatioP95 <= 0.05`、elbow flip reject `<= 2`、NaN / side swap / owned bone conflict `0`を満たす。
- [ ] `maxReachRatio` やavatar arm lengthを単に縮小してoccupancyだけを下げる変更は禁止する。target方向、hand-to-chest交差の視認性、左右armの最終poseを実写videoで確認し、修正前後の所見を `impl.md` に残す。
- [ ] Phase 6 schema/parser、metrics facade/summary/comparison、viewer表示と `documents/design/frontend/character/motion.md`、`tracking.md` を同期する。
- [ ] TypeScript production comment auditを指定列（`path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note`）で `impl.md` に記録する。bridge/solver clamp ownership、ratioの座標・分母、旧log fallback、p95 sample policyを必須対象とし、実コードのTSDoc/JSDocも更新する。弱い既存コメントはrewrite/deleteし、stale commentは更新/削除する。コメント追加前に命名・関数分割・型・options objectで自明化できないか確認する。評価時は変更した全symbol/decisionを照合し、逐語説明、型から明らかな説明、失敗条件を欠くheuristic説明、定型audit理由が残ればFAILとする。

## 設計判断（着手前に確定済み）

- clampの正本は最終的にIK solverが適用したtargetとする。bridgeのpre-clampはproduction安全境界として残すが、要求値と適用値を両方保存し、bridgeで情報を消さない。
- bridgeとsolverの両方がclampしたframeでは `clampedBy: "solver"` を優先し、`requestedReachRatio` はbridge clamp前、`appliedReachRatio` はsolverが最終適用したtargetをarm lengthで割った値とする。
- 新規snapshot fieldは `motionDebugPhase6Snapshot.ts` のarm単位optional `reach` に置き、schema versionは `sincro.phase6-solver.v1`を維持する。required field変更ではなく旧log互換を保てるため、v2へ上げない。
- p95はfinite sampleを昇順にし `ceil(0.95 * n) - 1` indexで選ぶnearest-rank法に固定する。平均だけでは短時間の大きな超過を隠すため採用しない。
- baseline比occupancyだけをexit gateにしない。既存baseline自体が絶対thresholdを超えるため、新しいexcess量の絶対条件と視認確認を併用する。
- canonical実写入力は依存タスクの `artifacts/video/arms-cross.browser.mp4` に固定し、3 runの前にSHA-256を記録する。別container、再encode、元MOVへの差し替えは同一比較として扱わない。

## スコープ境界

- 本タスク: reach/clamp診断contract、metric、`arms-cross`原因修正、実写3 run、docs/comment同期。
- 依存タスク: production temporal primary経路と canonical input `artifacts/video/arms-cross.browser.mp4` を提供する。
- スコープ外: recovery fixture、Pose fallback削除、Hand wristの主入力化、arm length calibration全般、他P0 gestureの品質再調整、backend/WebRTC変更。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts:84-106` は現在bridgeで先にclampし、clamp後だけから `targetReachRatio` を作る。ここにrequested/appliedの保存境界を追加する。
- `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:237-259` はtarget ratioを受け、`:312`でsolver clamp結果を返す。bridge/solver ownership統合はこの2箇所で行う。
- `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:131-170` はv1 strict parser、`:318-345` はruntimeからのsnapshot変換である。optional reach parser/serializerを双方へ追加する。
- `sincromisor-frontend/src/character/motionEvaluation/motionMetricSolverCalculators.ts:97-105` は現在boolean `targetClamped` のoccupancyだけを計算する。新p95 calculatorは同fileへ置く。
- `sincromisor-frontend/src/character/motionEvaluation/motionMetricThresholds.ts:97` のoccupancy thresholdは既存契約として維持し、本タスクで実写結果に合わせて緩和しない。

## テスト

- focused unit tests: bridgeのpre/post ratio、invalid arm length、bridge-only/solver-only/no-clamp、Phase 6旧log parse、新p95のnearest-rankとsample 0件を確認する。
- current taskの`arms-cross`実写videoから3 run artifactを作り、受け入れ条件の数値と左右/source内訳を確認する。
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run test`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visibleなPhase 6 snapshotとmetrics contractを拡張するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` のsnapshot/metric/clamp ownershipを同期する。公開WebRTC/backend契約は変更しない。
