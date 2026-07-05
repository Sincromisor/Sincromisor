# Implementation Log: task-260705214026-canonical-temporal-arm-solver-production

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- review.md は APPROVED / freshness FRESH のため実装に進めた。
- production arm IK primary は `SincroPoseRetargeter.retarget(snapshot, nowMs, { temporal, profile })` から入り、`createSincroPoseTemporalArmInput()` 経由で `createTemporalArmIkInput()` の target を使う構成にした。
- `retarget(snapshot, nowMs)` 未指定時の互換性は、`temporal_input_missing` / `avatar_profile_missing` / `ik_solver_missing` を `solverSource` に残しつつ、既存 `retargetPoseArm()` fallback を使う形で維持した。
- `solveWorldArmIk()` は削除せず deprecated fallback / A/B comparison 用として残した。削除条件はコードコメントと design docs に記録した。
- Hand wrist は production arm IK target の主入力にしていない。Hand snapshot は今回の provider / retargeter input では読まず、temporal/profile/solver measurement だけで primary を作る。
- final normalized pose / composer ownership は変更していない。`VRMCharacterManager.update()` は retargeter の第 3 引数に temporal/profile を渡すだけで、`VrmPoseComposer` と full application の所有境界は維持した。
- 前タスク `task-260705214018-mediapipe-raw-result-replay/impl.md` / `eval.md` の worktree 差分は本実装 commit には含めていない。`npm run check` が repository-wide Markdown check でその 2 件の Prettier formatting に失敗したため、gate を通す目的の Prettier-only 差分として別 commit `d2db53a` に分離した。main checkout 側の前タスクログは触っていない。

### P0 replay fixture metrics comparison

- artifact: `artifacts/p0-temporal-vs-pose-fallback-metrics-comparison.synthetic.json`
- 実 camera P0 NDJSON replay は repository 内に committed fixture として存在せず、既存 baseline task でも P0 production replay は `not-captured` と記録されている。そのため、実機 P0 regression を主張せず、利用可能な synthetic replay comparison として保存した。
- 比較対象: baseline `pose-snapshot-fallback`、candidate `temporal-primary`。
- 対象 fixture id: `neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、`arms-cross`、`fast-wave`。
- 結果: `neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`reachClampOccupancy`、`solverReachClampOccupancy` はすべて `unchanged` / `regression: false`。実 camera P0 capture は未取得であり、残リスクとして最終報告にも残す。

### TypeScript production comment audit

| path                                                                               | symbol or decision                                                       | kind                                                          | current comment                                  | decision      | required maintenance knowledge                                                                                                                                                                                                     | action                                                                                                                                                                  | reviewer note                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `sincromisor-frontend/src/character/retargeting/sincroPoseTemporalArmInput.ts`     | `createSincroPoseTemporalArmInput`                                       | public export / production input provider / fallback boundary | new file, no existing comment                    | add           | production primary は Temporal + MinimalAvatarMotionProfile + solver measurement。Pose snapshot / Hand wrist は primary target 算出に使わない。欠損や invalid/lost は throw せず source debug と pose-snapshot fallback に落とす。 | function TSDoc を追加。fallback reason は `temporal_input_missing`、`avatar_profile_missing`、`temporal_arm_lost`、`invalid_temporal_arm`、`ik_solver_missing` に固定。 | provider が Hand wrist を読まないこと、欠損 reason を個別に保持することを test 済み。                        |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts`           | `SincroPoseRetargetRuntimeInput` / `retarget(snapshot, nowMs, runtime?)` | public type / runtime boundary                                | class-level old optional pose commentのみ        | add / rewrite | 第 3 引数が無い場合の旧挙動互換、temporal/profile が揃う場合の primary、fallback reason の保存、observable output は `SincroPoseRetargetFrame` arm `solverSource` / `temporalBridge`。VRM pose side effect はここでは発生しない。  | runtime input type を追加し、`retarget()` に JSDoc を追加。古い class comment は残しつつ、この boundary の契約は method comment に置いた。                              | `VRMCharacterManager.update()` から temporal/profile を渡し、未指定 call site の互換は optional arg で維持。 |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts`           | fallback reason policy                                                   | fallback decision                                             | no explicit source comment                       | add           | temporal/profile/solver 欠損は欠損 field ごとに reason を残す。bridge invalid/lost と solver solve failure は pose-snapshot fallback に戻す。fallback は rollback / debug 比較のため残す。                                         | provider TSDoc、retarget method TSDoc、docs に分散して明記。                                                                                                            | Phase 6 `source` と provider test で照合可能。                                                               |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts`           | Hand wrist non-adoption                                                  | design / boundary decision                                    | no code comment                                  | add           | Hand wrist は palm / finger / gesture 補助であり、production arm IK target の主入力ではない。                                                                                                                                      | provider TSDoc と design docs に明記。retargeter input shape に Hand snapshot を追加しないことで実装上も固定。                                                          | grep で provider / retargeter が Hand snapshot を読まないことを確認。                                        |
| `sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts`           | `solveWorldArmIk`                                                        | deprecated fallback                                           | public export had no lifecycle comment           | add           | Pose snapshot world target 経路は削除せず、P0 replay A/B comparison と fallback cleanup task まで残す。削除条件は temporal primary と fallback 不要化の確認。                                                                      | `@deprecated` JSDoc を追加。TODO は追加していない。                                                                                                                     | production primary からは temporal path が先に使われ、fallback でのみ参照。                                  |
| `sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts`       | `createTemporalArmIkInput`                                               | public export / coordinate heuristic                          | no function TSDoc                                | add           | body-local / scalar temporal state から shoulder-local IK target を作る。Pose/Hand wrist を読まない。lost / non-finite は exception ではなく reason code。scale / clamp / weight は profile + solver measurement で決まる。        | function TSDoc を追加。                                                                                                                                                 | 既存 bridge tests と provider tests で input boundary を確認。                                               |
| `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts` | `MotionDebugPhase6ArmSolverSnapshot.source`                              | schema / replay compatibility                                 | module comment already described contract/parser | add           | `sincro.phase6-solver.v1` は schemaVersion を上げず optional `source` を追加。source 欠損旧 log は parse success とし、viewer/parser 上は pose-snapshot fallback 相当に正規化する。                                                | type/schema/serializer/parser を更新。module comment は維持。                                                                                                           | `motionDebugRecorder.test.ts` で legacy source 欠損 parse を確認。                                           |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetFrame.ts`        | arm `solverSource` / `temporalBridge` cloning                            | lifecycle / saved debug state                                 | no explicit comment                              | keep          | frame smoothing/clone は runtime debug state を参照共有しない必要がある。Vector3 target は clone する。                                                                                                                            | private clone helpers を追加。private helper は命名と型で十分と判断し TSDoc は省略。                                                                                    | Phase 6 serializer は cloned frame から bridge/source を保存する。                                           |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`           | composer ownership                                                       | lifecycle / ownership decision                                | update order comment exists                      | keep          | temporal/profile を retargeter に渡しても composer dry-run / full normalized pose application / direct arm fallback の所有順序は変えない。                                                                                         | update order は変更せず、既存コメントを維持。docs に ownership 非変更を記録。                                                                                           | `VrmPoseComposer` へ渡る final normalized pose の ownership を変更していない。                               |

TODO は追加していない。stale になった「Temporal bridge は本番切替ではない」「腕 IK target は Pose wrist 正本」の design docs 記述は rewrite した。

### ドキュメント同期

- `documents/design/frontend/character/motion.md`: Temporal primary / pose-snapshot fallback、fallback reason、旧 `solveWorldArmIk()` の deprecated lifecycle、Hand wrist 非採用、composer ownership 非変更を同期。
- `documents/design/frontend/character/tracking.md`: Hand wrist 非採用、Phase 6 `source` optional field と旧 log 互換、P0 metrics comparison の記録方針を同期。
- 公開 WebRTC / backend contract、DataChannel payload、server code は変更していないため、該当 docs の同期は不要。

### 検証

- `cd sincromisor-frontend && npm run test -- temporalArmSolverBridge sincroPoseTemporalArmInput motionDebugRecorder`: PASS。
- `cd sincromisor-frontend && npm run test -- sincroPoseTemporalArmInput temporalArmSolverBridge motionDebugRecorder motionMetrics motionComposerComparisonMetrics sincroVrmPoseComposerDryRun`: PASS。6 files / 59 tests passed。
- `cd sincromisor-frontend && npm run check:biome`: PASS。
- `cd sincromisor-frontend && npm run check`: 初回は前タスク Markdown 2 件で FAIL。Prettier-only 整形後 PASS。
- `cd sincromisor-frontend && npm run build`: PASS。
- `npm run gate`: PASS at clean SHA `d2db53a`。lint / build / test all PASS、65 files / 496 tests passed。

### コミット

- `e3a5492` `feat(character): promote temporal arm solver input`
    - 本タスクの実装、テスト、docs sync、synthetic P0 comparison artifact。
- `d2db53a` `chore(tasks): format prior raw replay logs for gate`
    - `npm run gate` の Markdown check を通すための前タスクログ Prettier-only 差分。本実装 commit からは分離。

### 未実行 / 残リスク

- 実 camera P0 replay capture による temporal primary vs pose fallback comparison は未実行。repository 内に committed NDJSON P0 recording が無く、既存 baseline manifest も `not-captured` のため。synthetic artifact は regression なしを示すが、実機 coverage ではない。

## attempt 2

### 判断

- 評価 FAIL の残課題に対応し、同じ implementation worktree / branch に追加 commit `e7caaa8` を作成した。
- P0 replay fixture は repository 内を再探索したが、captured production replay として扱える `.ndjson` / `.ndjson.gz` / `.jsonl` / `.jsonl.gz` artifact は見つからなかった。
- 既存の canonical baseline manifest `task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md` は 6 つの P0 fixture をすべて `source: not-captured` としており、replay logs / metrics summaries を real-camera evidence と扱わないよう明記している。
- `production-composer-comparison-summaries.not-captured.json` は P0 fixture ids を含むが、全 metric が `not_available` / `baseline_not_captured`。`torso-shoulder-composer-migration-replay.json` と motion QA fixtures は synthetic / 別目的であり、本 task の temporal primary vs pose-snapshot fallback metrics comparison には使えない。
- そのため、P0 metrics comparison の acceptance は実装環境内では完全充足できない。必要 artifact 形式と未実行理由、manual / real-device capture が必要な旨を worktree artifact `artifacts/p0-replay-fixture-search.attempt2.md` に保存した。
- 前タスク `task-260705214018-mediapipe-raw-result-replay/impl.md` / `eval.md` には attempt 2 で追加変更を入れていない。

### TypeScript production comment audit

| path                                                                           | symbol                               | decision | required maintenance knowledge                                                                                                                                     | action                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts`       | `SincroPoseRetargetRuntimeInput`     | add      | `temporal` / `profile` 欠損時は例外ではなく arm `solverSource` に理由を残し、Pose snapshot fallback へ戻す。保存境界に VRM / Three.js / MediaPipe raw を含めない。 | symbol 固有 TSDoc を追加。                                                                 |
| `sincromisor-frontend/src/character/retargeting/sincroPoseTemporalArmInput.ts` | `SincroPoseTemporalArmInput`         | add      | `snapshot` は fallback 境界であり temporal primary target では Pose wrist / Hand wrist を読まない。`temporal` / `profile` / `solver` 欠損は diagnostic へ残す。    | symbol 固有 TSDoc を追加。                                                                 |
| `sincromisor-frontend/src/character/retargeting/sincroPoseTemporalArmInput.ts` | `SincroPoseTemporalArmInputResult`   | add      | `target` は temporal bridge 有効時だけ入り、fallback でも `source` は必ず保存する。`bridge` は optional debug surface。                                            | symbol 固有 TSDoc を追加。                                                                 |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts`    | `SincroPoseArmSolverPrimarySource`   | add      | `"temporal"` と `"pose-snapshot-fallback"` の意味、fallback が temporal/profile/solver/bridge 欠損時だけ使われること、replay 保存境界を明示する必要がある。        | symbol 固有 TSDoc を追加。                                                                 |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts`    | `SincroPoseArmSolverSource`          | add      | `fallbackReason` と `bridgeReasonCodes` の役割、`targetReachRatio` / `temporalState` が reach clamp / recovery comparison 用の最小保存情報であること。             | symbol 固有 TSDoc を追加。                                                                 |
| `documents/design/frontend/character/motion.md`                                | old Pose wrist canonical description | rewrite  | Hand wrist は target にしないまま、production arm IK target は temporal bridge primary、pose snapshot は欠損 / invalid / lost 時の fallback である。               | 評価指摘の旧 `targets.wrist` 正本記述を temporal primary / pose-snapshot fallback へ同期。 |

TODO は追加していない。stale comment の削除対象はなく、評価指摘の stale design text は rewrite した。

### ドキュメント同期

- `documents/design/frontend/character/motion.md`: line 50 / 79 付近の旧 Pose wrist 正本記述を、temporal bridge primary と pose-snapshot fallback 方針へ同期した。
- 新規公開 WebRTC / backend contract、DataChannel payload、server code は変更していないため、その他 contract docs の同期は不要。

### P0 fixture 条件

- 実録 P0 replay fixture: repository 内に存在しないと判断。
- 保存した探索ログ: `tasks/character-sincro-motion/task-260705214026-canonical-temporal-arm-solver-production/artifacts/p0-replay-fixture-search.attempt2.md`
- 必要 artifact 形式: `artifacts/replay/<metrics-fixture-id>.ndjson` または `.ndjson.gz`、`artifacts/metrics/<metrics-fixture-id>.summary.json`、任意で `.baseline.json`。
- 比較未実行理由: `neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`reachClampOccupancy` を temporal primary と pose fallback で比較できる captured production frames が無い。synthetic artifact だけでは評価上 PASS 不能という指摘に合わせ、実機 / 手動 capture が必要な残リスクとして残す。

### 検証

- `cd sincromisor-frontend && npm run test -- character/retargeting/__tests__/sincroPoseTemporalArmInput.test.ts character/retargeting/__tests__/sincroPoseRetargeter.test.ts`: PASS。1 file / 4 tests passed。
- `cd sincromisor-frontend && npm run check`: PASS。
- `cd sincromisor-frontend && npm run build`: PASS。
- `npm run gate`: PASS at clean SHA `e7caaa8`。lint / build / test all PASS、65 files / 496 tests passed。

### コミット

- `e7caaa8` `fix(character): document temporal arm solver boundary`
    - attempt 2 の TSDoc 補強、motion.md 同期、P0 replay fixture 探索ログ artifact。
