# Implementation Log: task-260629225942-production-retarget-composer-motion-metrics-comparison

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- `review.md` の申し送りどおり、comparison parser は `frame.solver.poseRetargetRuntime` だけを読む実装にした。旧 `frame.solver.poseRetarget` は既存 motion metrics 用 slot として残し、composer comparison では fallback source にしていない。
- `poseRetargetRuntime` は現行 recording で `upperBody` を持たないため、`NEUTRAL_POSE_FRAME` を土台に `active` / `confidence` / `ikMode` / `fallbackReason` / `solverProbe` / `anchor` / `leftArm` / `rightArm` だけを上書きする parser にした。補完した `upperBody` は angle delta の対象にしていない。
- `source: not-captured` の 6 fixture は実比較入力ではなく availability failure として扱い、artifact では全 fixture を `comparison_unavailable` / `warn` / `baseline_not_captured` / 全 metric `not_available` にした。実 angle delta は生成していない。
- comparison summary は feature flag 適用の判断材料であり、実適用の合否自動判定は実装していない。

### Comment Audit

| path                                                                                     | symbol or decision                                                                | kind                     | current comment              | decision | required maintenance knowledge                                                                                                            | action                                                                                                | reviewer note                                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------ | ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | `calculateComposerComparisonMetrics()`                                            | public export            | 既存なし                     | add      | 入力境界は plain object、angle delta 対象は腕 quaternion 4 bone、upperBody は対象外、angular velocity は composer 判定済み clamp を数える | JSDoc を追加                                                                                          | helper input に前 frame や VRM object が増えていないこと              |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | `ComposerComparisonMetricFrameInput`                                              | public export / boundary | 既存なし                     | add      | `{ mediaTimeMs; retarget?; composerDryRun? }` 固定、VRM Object3D / THREE.Quaternion instance を保存境界に出さない                         | TSDoc を追加                                                                                          | 型が task 指定 shape から逸脱していないこと                           |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | `ComposerComparisonMetricFrameResult`                                             | public export            | 既存なし                     | add      | frame raw 値と summary threshold 判定の責務分離、missing frame は count 1 として扱う                                                      | TSDoc を追加                                                                                          | missing frame で `composerMissingPoseFrameCount` が 1 になること      |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | `ComposerComparisonSummary` / `COMPOSER_COMPARISON_SUMMARY_SCHEMA_VERSION`        | schema / public export   | 既存なし                     | add      | `sincro.composer-comparison-summary.v1`、既存 `sincro.motion-metrics.v1` と分ける理由、inputs は path と有無だけ                          | TSDoc を追加                                                                                          | schemaVersion と required fields が artifact / tests と一致すること   |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | 5 metric key                                                                      | public const / contract  | 既存なし                     | add      | key rename は artifact 破壊的変更、missing key は availability failure を pass にしないため常時含める                                     | `COMPOSER_COMPARISON_METRIC_KEYS` に TSDoc を追加                                                     | key が task 指定 5 件に固定されていること                             |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | threshold / severity table                                                        | heuristic                | 既存なし                     | add      | unit / direction / threshold、summary severity は最大 severity、誤調整時に pass/warn/fail が変わる                                        | metric definition const 近傍は型と値で固定し、public schema / helper TSDoc と design doc に意味を記録 | threshold 値が task 指定と一致すること                                |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | `parseComposerComparisonFrameInput()` / `frame.solver.poseRetargetRuntime` parser | parser / boundary        | 既存なし                     | add      | 正本 slot は `poseRetargetRuntime`、旧 slot 非参照、invalid は fallback 再計算しない、`NEUTRAL_POSE_FRAME` 補完範囲                       | JSDoc を追加                                                                                          | test が old slot only で retarget undefined を確認していること        |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | `not_available` / `comparison_unavailable` を pass にしない判断                   | fallback / severity      | 既存なし                     | add      | baseline 未取得、dry-run 欠損、全 frame missing は warn 以上で可視化し、pass 色にしない                                                   | unavailable summary helper に JSDoc、tests、artifact を追加                                           | `severity: "warn"` と metric `status: "not_available"` を確認すること |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | `baseline_not_captured` fallback                                                  | fallback / artifact      | 既存なし                     | add      | `source: not-captured` は実比較入力ではなく、angle delta を捏造しない                                                                     | `createComposerComparisonUnavailableSummary()` と not-captured artifact を追加                        | 6 fixture artifact が `baseline_not_captured` であること              |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` | dry-run 欠損 fallback                                                             | fallback / parser        | 既存なし                     | add      | `status !== "available"` または `result` 欠損は missing frame count 1、旧 log / dry-run 欠損を暗黙 pass にしない                          | helper と summary tests を追加                                                                        | `not_ready` dry-run が missing になること                             |
| `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts`                   | facade re-export                                                                  | public facade            | facade の責務コメントあり    | rewrite  | composer comparison の public surface を facade 互換 export に含めるが、実装 logic は持たない                                             | re-export を追加し、既存 facade コメントは責務として成立するため維持                                  | import path `../motionMetrics` から新 helper / types を取得できること |
| `documents/design/frontend/character/motion.md`                                          | metrics / motion-debug 節                                                         | design doc sync          | composer comparison 記述なし | add      | schema、metric key、threshold、parser 方針、not_available / baseline_not_captured、feature flag 判断材料                                  | 該当節に追記                                                                                          | 公開挙動の設計同期が同一差分に入っていること                          |

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に composer comparison summary schema、5 metric key の意味と threshold、`poseRetargetRuntime` parser 方針、`comparison_unavailable` / `baseline_not_captured` / dry-run 欠損を pass にしない扱い、feature flag 判断材料であることを同期した。
- WebRTC 契約、公開 API endpoint、compose / env は変更していないため同期不要。

### 生成 artifact / 手動確認

- worktree 側に `tasks/character-sincro-motion/task-260629225942-production-retarget-composer-motion-metrics-comparison/artifacts/composer-comparison/production-composer-comparison-summaries.not-captured.json` を追加した。
- Node で artifact を読み、6 fixture すべてが `status: "comparison_unavailable"`、`severity: "warn"`、`unavailableReason: "baseline_not_captured"`、5 metric すべてが `not_available` / `warn` / `baseline_not_captured` であることを確認した。

### Verification

- `cd sincromisor-frontend && npm run test -- motionComposerComparisonMetrics`
- `cd sincromisor-frontend && npm run test -- motionComposerComparisonMetrics motionMetrics motionQaRegression sincroVrmPoseComposerDryRun`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`
- `npm run gate`

### Not Run

- 実カメラ replay / recapture は未実行。現行 baseline manifest が 6 fixture すべて `source: not-captured` であり、本タスクの範囲は availability summary 生成までのため。

### Completion Summary

- 判定: 実装完了。`npm run gate` PASS。
- 変更概要: composer comparison metric helper / parser / summary contract、facade re-export、単体テスト、not-captured summary artifact、設計文書同期を追加した。
- 残リスク: 実カメラ captured replay と production dry-run result の実データ比較は、baseline recapture 後の別タスクで確認が必要。

### Post-Commit Verification

- Commit: `44238134a8d94bcf0b62502cb9b845533ad1c3f3`
- `npm run gate` を clean HEAD `4423813` で再実行し、lint / build / test すべて PASS。

## attempt 2

### FAIL 対応

- `eval.md` の指摘どおり、既存 `frame.finalPose.schemaVersion = "sincro.vrm-pose-composer-result.v1"` snapshot を production dry-run result として `available` 扱いしていた fallback を削除した。
- `parseComposerDryRunFromFrame()` は status 付き `SincroVrmPoseComposerDryRunResult` snapshot だけを受理する。legacy finalPose snapshot しかない旧 log は `composerDryRun: undefined` となり、summary では `retarget_or_composer_not_recorded` / `not_available` / `warn` 以上に落ちる。
- unit test は status 付き dry-run snapshot と legacy finalPose snapshot を分け、legacy finalPose snapshot が comparison unavailable になる regression を追加した。

### Comment Audit 差分

| path                                                                                                    | symbol or decision                                                    | kind              | current comment                                                                                                            | decision | required maintenance knowledge                                                                                                                                                    | action                                                                                    | reviewer note                                                                       |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts`                | `parseComposerDryRunFromFrame()` dry-run 欠損 fallback                | parser / fallback | attempt 1 では legacy finalPose を dry-run result へ変換しており、コメントもその危険を明示していなかった                   | rewrite  | `sincro.vrm-pose-composer-result.v1` は motion-debug finalPose layer であり、status 付き production dry-run result contract ではない。昇格すると旧 log を比較済み pass と誤読する | fallback 変換を削除し、status 付き result だけ受理する実装コメントを追加                  | `finalPose` schemaVersion 付き snapshot で `composerDryRun` が undefined になること |
| `documents/design/frontend/character/motion.md`                                                         | legacy finalPose snapshot と production dry-run result の区別         | design doc sync   | attempt 1 では dry-run 欠損を pass にしないとは書いたが、legacy finalPose layer を dry-run result に昇格しない点が弱かった | rewrite  | `frame.finalPose` は既存 finalPose layer。comparison parser は status contract のない snapshot を dry-run available へ変換しない                                                  | composer comparison summary 節へ明記                                                      | 評価者は design doc と parser の挙動が一致することを確認する                        |
| `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionComposerComparisonMetrics.test.ts` | status 付き dry-run result と legacy finalPose snapshot の regression | test              | attempt 1 test は legacy finalPose snapshot を available と期待していた                                                    | rewrite  | dry-run 欠損旧 logを warn unavailable にする受け入れ条件                                                                                                                          | helper 名を分け、status 付き snapshot accepted と legacy snapshot rejected の test を追加 | test count が 35 から 37、gate 全体が 428 tests になる                              |

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に、既存 `frame.finalPose.schemaVersion = "sincro.vrm-pose-composer-result.v1"` は motion-debug finalPose layer であり、status 付き production dry-run result ではないため、composer comparison parser が `composerDryRun.status = "available"` へ昇格しないことを追記した。
- WebRTC 契約、公開 API endpoint、compose / env は変更なし。

### Verification

- `cd sincromisor-frontend && npm run test -- motionComposerComparisonMetrics motionMetrics motionQaRegression sincroVrmPoseComposerDryRun`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`
- `npm run gate`

### Not Run

- 実カメラ replay / recapture は未実行。attempt 2 の修正対象は parser の dry-run result 判定と regression test であり、現行 baseline manifest は引き続き 6 fixture すべて `source: not-captured`。

### Completion Summary

- 判定: FAIL 残課題を修正。dirty worktree 状態で `npm run gate` PASS。
- 変更概要: legacy finalPose snapshot の available 昇格を削除し、status 付き dry-run result と legacy finalPose snapshot の区別を test / design doc / parser comment に固定した。
- 残リスク: status 付き dry-run result を replay frame のどの slot に保存するかは後続の recording / recapture task 側の contract 確定が必要。

### Post-Commit Verification

- Commit: `871f85a3be7314ed0901cb141a80b0f108f29d70`
- `npm run gate` を clean HEAD `871f85a` で再実行し、lint / build / test すべて PASS。
