# Compare production retarget and composer motion metrics

## 背景 / 目的

composer dry-run が入っても、それが旧 `SincroPoseRetargeter` 経路より良いか悪いかを数値で比較できなければ実適用へ進めない。本タスクでは baseline replay と dry-run result を使い、旧 retarget applied 相当と composer final pose の差分を metrics 化する。

前提として、依存タスク `task-260629225919-production-sincro-motion-replay-baselines` の現在の
baseline manifest は 6 fixture すべてが `source: not-captured` であり、実カメラ由来の replay log /
metrics summary はまだ存在しない。このため本タスクでは、実比較 helper と summary contract を実装しつつ、
現存する 6 fixture については「実比較できない」ことを `comparison_unavailable` / `not_available` summary
として明示する。`source: not-captured` を実比較済み、または pass として扱ってはならない。

## 完了条件（受け入れ条件）

- [ ] `motionEvaluation` 配下に旧 retarget frame と composer dry-run result を比較する helper を追加し、metric key は `composerAngleDeltaDeg`、`composerAngularVelocitySpike`、`composerOwnedBoneConflictCount`、`composerSuppressionCount`、`composerMissingPoseFrameCount` に固定する。
- [ ] helper の追加先は `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` に固定し、`calculateComposerComparisonMetrics(input)`、`ComposerComparisonMetricFrameInput`、`ComposerComparisonMetricFrameResult` を export する。既存 facade `motionMetrics.ts` から必要な型 / helper を re-export する。
- [ ] `ComposerComparisonMetricFrameInput` は `{ mediaTimeMs: number; retarget?: SincroPoseRetargetFrame; composerDryRun?: SincroVrmPoseComposerDryRunResult }` に固定し、VRM Object3D / `THREE.Quaternion` instance を含めない。
- [ ] comparison input は replay frame / live snapshot の plain object に限定し、VRM Object3D や `THREE.Quaternion` instance を保存境界に出さない。
- [ ] replay / live snapshot から `retarget` を作る parser は、`frame.solver.poseRetargetRuntime` を正本 slot とする。`frame.solver.poseRetarget` は既存 metrics の旧 slot として残るため、本 comparison では読まない。`poseRetargetRuntime` 欠損または invalid の frame は fallback 再計算せず、その frame の `composerMissingPoseFrameCount` に 1 を加える。
- [ ] `poseRetargetRuntime` は現行 recording では `SincroPoseRetargetFrame` の `upperBody` を保存しないため、parser は `NEUTRAL_POSE_FRAME` を土台に `active`、`confidence`、`ikMode`、`fallbackReason`、`solverProbe`、`anchor`、`leftArm`、`rightArm` だけを上書きして `SincroPoseRetargetFrame` を構成する。comparison metric は left / right arm quaternion だけを読むため、補完した `upperBody` は angle delta の対象にしない。
- [ ] available frame の `composerAngleDeltaDeg` は、旧 retarget の `leftArm.upperArmQuaternion`、`leftArm.lowerArmQuaternion`、`rightArm.upperArmQuaternion`、`rightArm.lowerArmQuaternion` をそれぞれ `leftUpperArm`、`leftLowerArm`、`rightUpperArm`、`rightLowerArm` に対応付け、composer `result.finalPose` に同じ bone がある組だけを比較する。frame 値は比較できた bone の quaternion geodesic distance の最大値（degree）、summary 値は available frame の p95、unit は `deg`、direction は `lower_is_better`、threshold は `{ pass: 12, warn: 25, fail: 45 }` に固定する。
- [ ] available frame の `composerAngularVelocitySpike` は、composer `result.clampedBones` のうち `reason === "angular_velocity"` の unique bone 数を frame 値とし、summary 値は全 available frame の合計、unit は `count`、direction は `lower_is_better`、threshold は `{ pass: 0, warn: 2, fail: 5 }` に固定する。前フレームを helper input へ追加して速度を再計算しない。
- [ ] available frame の `composerOwnedBoneConflictCount` は、composer `result.warnings` の `owned_bone_conflict:` prefix を持つ unique warning 数を frame 値とし、summary 値は合計、unit は `count`、direction は `lower_is_better`、threshold は `{ pass: 0, warn: 0, fail: 0 }` に固定する。
- [ ] available frame の `composerSuppressionCount` は、composer `result.suppressedLayers.length` を frame 値とし、summary 値は合計、unit は `count`、direction は `lower_is_better`、threshold は `{ pass: 0, warn: 30, fail: 120 }` に固定する。
- [ ] `composerMissingPoseFrameCount` は、`retarget` 欠損、`composerDryRun` 欠損、`composerDryRun.status !== "available"`、`composerDryRun.result` 欠損、または `composerAngleDeltaDeg` の比較対象 bone が 0 件の frame を 1 として数える。summary 値は合計、unit は `count`、direction は `lower_is_better`、threshold は `{ pass: 0, warn: 1, fail: 3 }` に固定する。
- [ ] summary severity は 5 metric の最大 severity とする。全 frame が missing / not available の captured replay では `status: "comparison_unavailable"`、`severity: "warn"` 以上、`unavailableReason: "retarget_or_composer_not_recorded"` とし、baseline `source: not-captured` の `baseline_not_captured` とは reason code を分ける。
- [ ] comparison summary artifact schema は `sincro.composer-comparison-summary.v1` に固定し、少なくとも `fixtureId`、`baselineSource`、`status`、`severity`、`metrics`、`warnings`、`unavailableReason?`、`generatedAtIso`、`inputs` を持つ。`status` は `"available"` または `"comparison_unavailable"` に固定し、`inputs` には baseline manifest path、replay log path の有無、composer dry-run result の有無を plain object で記録する。
- [ ] baseline artifact の 6 fixture について comparison summary を生成できる。ただし現在の manifest が `source: not-captured` かつ replay log / metrics summary 未生成の fixture では、実 angle delta を捏造せず `status: "comparison_unavailable"`、`severity: "warn"` 以上、`unavailableReason: "baseline_not_captured"` の summary を生成する。
- [ ] `comparison_unavailable` summary では 5 つの固定 metric key をすべて `status: "not_available"`、`severity: "warn"` 以上、`unavailableReason: "baseline_not_captured"` として出力し、Debug Console / artifact 上で pass 色や pass 判定にしない。
- [ ] composer dry-run が無い旧 log では `not_available` として warn 以上にし、暗黙に pass にしない。
- [ ] comparison は実適用の合否を自動決定しない。結果は feature flag 適用タスクの判断材料として artifact / Debug Console に出す。
- [ ] `documents/design/frontend/character/motion.md` の metrics / motion-debug 節に、composer comparison summary schema、5 metric key の意味、`comparison_unavailable` / `baseline_not_captured` / composer dry-run 欠損を pass にしない扱い、feature flag 判断材料であることを同期する。
- [ ] production TypeScript comment audit を実施し、metric key の意味、threshold / severity、replay slot parser 方針、`not_available` の扱い、保存境界の制約を public helper / threshold / parser 近傍に記録する。
- [ ] `impl.md` に comment audit table を記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、対象は `calculateComposerComparisonMetrics()`、input / result type、summary artifact schema、各 metric key、threshold / severity table、`frame.solver.poseRetargetRuntime` parser、`not_available` / `comparison_unavailable` を pass にしない判断、`baseline_not_captured` fallback、dry-run 欠損 fallback、facade re-export を必ず含める。
- [ ] audit の `decision` は `keep` / `rewrite` / `delete` / `add` に限定する。弱い既存コメント、実装と矛盾した stale comment、名前・型から分かるだけのコメントは `rewrite` または `delete` にする。コメントを省略する場合は省略理由を audit に書く。TODO を追加する場合は理由、削除条件、canonical task ID、判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- 既存 `motionMetrics` に新 metric group を追加する。別 harness を作る案は、QA regression と baseline comparison の経路が分裂するため採用しない。
- metric 計算本体は `motionComposerComparisonMetrics.ts` に分け、`motionMetrics.ts` は facade re-export に留める。巨大 facade に直接実装する案は責務が膨らみやすいため採用しない。
- `source: not-captured` の baseline manifest record は実比較入力ではなく availability failure として扱う。現時点の 6 fixture は `comparison_unavailable` summary を生成して後続 recapture の穴を可視化する。
- `not_available` / `comparison_unavailable` は pass ではなく warn 以上にする。composer dry-run 欠損や baseline 未取得を見落とすと実適用判断を誤るため。
- replay comparison は `frame.solver.poseRetargetRuntime` を正本にする。`frame.solver.poseRetarget` は既存 metrics が読む旧 slot で、現行 motion-debug recording では config snapshot と紛らわしいため、この task では fallback source にしない。
- `composerAngularVelocitySpike` は frame 間速度を再計算せず、composer が既に判定した `clampedBones.reason === "angular_velocity"` を数える。helper input を過去 frame に広げると保存境界が複雑になり、dry-run contract の観測値と別の判定が混在するため。
- 本タスクは比較までで、feature flag を有効にする判断はしない。

## スコープ境界

- 本タスクでやること: metric helper、summary / comparison、fixture 実行手順、artifact 更新。
- 本タスクでやらないこと: composer 適用、dry-run 実装、baseline recording 取得、`source: not-captured` fixture からの synthetic / fake replay 生成、閾値の大幅調整。
- 依存タスクとの境界: baseline task は manifest と、取得できた場合の入力ログを用意する。現在の baseline task は 6 件すべて `source: not-captured` なので、本タスクはその状態を `comparison_unavailable` として報告するところまでを担当し、実カメラ recapture は別タスクに残す。dry-run task は composer result を用意する。本タスクは比較と availability summary だけを行う。

## 実装方針（既存コード整合: file:line）

- `motionMetrics.ts` は metrics 外部 import 互換 facade として使われている（`documents/design/frontend/character/motion.md:136`）。
- `VrmPoseComposerResult` は `finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を持つ（`sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts:43`）。
- `motion-debug` viewer は finalPose layer を `frame.finalPose` として扱う設計である（`documents/design/frontend/character/motion.md:161`）。
- baseline manifest は、現時点では 6 fixture すべてについて replay log / metrics summary を未生成とし、`source: not-captured` を実カメラ evidence として扱わないよう明記している（`tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md:8`）。
- `documents/design/frontend/character/motion.md` は production replay baseline の利用時に manifest の `source` を確認し、実機 baseline、synthetic、not-captured を混同しないことを要求している（`documents/design/frontend/character/motion.md:137`）。
- production dry-run result は `available` だけが composer result を持ち、非 available 状態では前回 result を流用しない contract である（`sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:21`）。
- motion-debug recording は solver slot に `poseRetarget` と `poseRetargetRuntime` を保存しており、runtime snapshot は `poseRetargetRuntime` に入る（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:234`）。
- `DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"]` は `SincroPoseRetargetFrame` から `active`、`confidence`、`ikMode`、`fallbackReason`、`solverProbe`、`anchor`、`leftArm`、`rightArm` を抜き出した runtime snapshot であり、`upperBody` は含まない（`sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts:80`）。
- 既存 `parsePoseRetarget()` は `frame.solver.poseRetarget` を読むため、composer comparison 用には別 parser を追加する（`sincromisor-frontend/src/character/motionEvaluation/motionMetricFrameParsers.ts:141`）。

## テスト

- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `cd sincromisor-frontend && npm run test -- sincroVrmPoseComposerDryRun`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`
- 手動確認: 6 fixture の現在の `source: not-captured` manifest から、各 fixture の summary が `status: "comparison_unavailable"`、`severity: "warn"` 以上、`unavailableReason: "baseline_not_captured"`、5 metric key すべて `not_available` になることを `impl.md` に記録する。

## ドキュメント同期の要否

要。developer-visible metrics / artifact schema が増えるため、`documents/design/frontend/character/motion.md` の metrics / motion-debug 節に comparison metric の意味、summary schema、`not_available` / `comparison_unavailable` / `baseline_not_captured` の扱い、feature flag 判断材料であることを同期する。公開 WebRTC 契約は変えない。
