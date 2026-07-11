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

## attempt 3

### 判断

- 前回 evaluator の FAIL は P0 replay fixture metrics comparison の一点であり、実装本体、fallback reason、debug snapshot、旧 log 互換、TSDoc / docs sync は PASS 済みと判断されている。
- worktree HEAD は `e7caaa8`、branch は `codex/task-260705214026-canonical-temporal-arm-solver-production`、作業開始時点の worktree は clean。
- repository 内に task.md が要求する captured production P0 replay fixture として扱える正規データ、fixture、生成スクリプト、既存 acceptance path が本当に無いか再確認した。
- 結論として、実録 P0 replay fixture は repository 内に存在しない。synthetic fixture や not-captured summary を P0 実録 comparison として昇格すると、前回 evaluator が明示した FAIL 条件を迂回するだけになるため、コードや artifact を無理に歪めない。
- attempt 3 では worktree 内のコード、docs、task artifact は変更していない。main checkout 側の本 `impl.md` だけに blocker と探索結果を append-only で記録する。

### P0 replay fixture 再探索範囲

- `git ls-files` / `find` / `rg --files` で `tasks/character-sincro-motion/**`、`documents/**`、`sincromisor-frontend/src/**` を確認し、`.ndjson`、`.ndjson.gz`、`.jsonl`、`.jsonl.gz`、recording、replay、fixture、baseline、metrics、comparison、motion-debug、raw-result を含む候補を検索した。
- 実 replay 形式の候補は、前回と同じく `tasks/character-sincro-motion/task-260705004405-torso-shoulder-composer-migration/artifacts/torso-shoulder-composer-migration-replay.json` だけだった。この artifact は `schemaVersion: "sincro.torso-shoulder-composer-migration-replay.v1"`、`generatedBy: "attempt-2 synthetic replay audit"` の torso / shoulder synthetic audit であり、production motion-debug frames、P0 arm fixture ids、temporal-primary vs pose-snapshot-fallback metrics comparison に必要な arm metrics を含まない。
- `tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md` は P0 fixture index として正規だが、6 件すべて `Source: not-captured` で、replay log path / metrics summary path は未生成。本文も replay logs / metrics summaries を real-camera evidence と扱わないよう明記している。
- `tasks/character-sincro-motion/task-260629225942-production-retarget-composer-motion-metrics-comparison/artifacts/composer-comparison/production-composer-comparison-summaries.not-captured.json` は P0 fixture ids を含むが、全 metric が `not_available`、`unavailableReason: "baseline_not_captured"`、`replayLog.available: false` であり、比較 artifact としては使えない。
- `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionQaRegressionTestFixtures.ts` は `source.kind: "synthetic"` の 3 frame log を生成する unit-test helper であり、captured production P0 replay fixture ではない。
- `tasks/character-sincro-motion/task-260627234129-character-animation-3-0-phase-10-fixed-motion-qa-regression-/acceptance/motionQaRegression.edge.test.mjs` は evaluator 専用 acceptance test で、P0 実録 fixture は含まず、変更対象外。
- `tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/artifacts/*.json` は historical Playwright / camera summary であり、motion-debug replay frames と temporal / pose fallback comparison 用の Phase 6 / metrics slot を持たない。
- `find` では committed / worktree 上の `.ndjson`、`.ndjson.gz`、`.jsonl`、`.jsonl.gz` production replay artifact は見つからなかった。

### Blocker

- P0 replay fixture metrics comparison の受け入れ条件は、この環境だけでは満たせない。必要なのは、production-like browser client で `motion-debug` / `simple-vrm` / `sincro` を使って取得した P0 6 種の captured replay log と、それを temporal primary / pose-snapshot fallback の両条件で評価した metrics summary。
- 必要 artifact 形式は既存 baseline manifest と同じく、`artifacts/replay/<metrics-fixture-id>.ndjson` または `.ndjson.gz`、`artifacts/metrics/<metrics-fixture-id>.summary.json`、必要に応じて `.baseline.json`。各 replay は `neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`reachClampOccupancy` を計算できる production frame / solver / temporal slot を含む必要がある。
- 受け入れ条件を満たすには、外部入力として実機または production-like camera session の P0 recording が必要。repository 内の synthetic / not-captured artifact だけでは evaluator の PASS 根拠にならない。

### TypeScript production comment audit

- attempt 3 では TypeScript production code を変更していないため、新規 comment audit 対象はない。attempt 1 / 2 の audit 結果は維持。

### ドキュメント同期

- attempt 3 では公開 API、通信契約、公開挙動、design docs を変更していないため追加同期は不要。attempt 1 / 2 で同期済みの `motion.md` / `tracking.md` は維持。

### 検証

- `npm run gate`: 実行予定。worktree HEAD が `e7caaa8` のままなら cache hit を期待する。

### コミット

- attempt 3 の worktree 変更はないため追加 commit は作成しない。

### 検証結果追記

- `npm run gate`: PASS at clean SHA `e7caaa8`。`gate:lint` / `gate:build` / `gate:test` はすべて cache hit。frontend tests は 496 passed。

## attempt 4

### 判断

- 前回 evaluator の FAIL は P0 replay fixture metrics comparison の一点であり、実装本体、Phase 6 `source`、fallback reason、旧 log 互換、comment audit / docs sync は PASS 済みと確認した。
- 指定 worktree `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-cc415b27024e-A9HaHw` の HEAD は `e7caaa8`、branch は `codex/task-260705214026-canonical-temporal-arm-solver-production`、作業開始時点の worktree は clean。
- 既存の motion replay / raw result replay / metrics infrastructure を再調査したが、task.md の「P0 replay fixture で temporal primary と pose fallback の metrics comparison」を正当に満たす captured production P0 replay fixture は repository 内に存在しない。
- 既存 synthetic artifact `artifacts/p0-temporal-vs-pose-fallback-metrics-comparison.synthetic.json` は `source.kind: "synthetic-replay-fixture"` / `realP0ReplayCapture: "not_available"` を明記しており、前回 evaluator の判定どおり、正規 P0 replay fixture comparison の根拠にはできない。
- attempt 4 では worktree のコード・docs・fixture・artifact は変更していない。main checkout 側の本 `impl.md` だけに blocker と gate 結果を append-only で記録する。

### 再調査結果

- `MotionDebugMetricsRuntime.calculateReplayMetrics()` は loaded recording が無い場合 `no_recording_loaded` を返す。`runQaRegression()` も loaded recording と P0 `fixtureId` または manifest 内の P0 source が必要であり、repository 内の `not-captured` manifest だけでは metrics summary を生成できない。
- `MotionReplayPlayer` / `MotionDebugReplayRuntime` の `mediapipe-raw-result` mode は `frame.mediapipe` slot 付きの `sincro.motion-debug-log.v1` NDJSON が前提。`frame.mediapipe` 欠損時は `missing_mediapipe_raw_result`、`applyRawResult` 欠損時は `unsupported_mode` で失敗し、`pose-snapshot` へ暗黙 fallback しない。
- `motionDebugLogSchema.ts` の motion-debug log parser は manifest と frame envelope を受理するが、実データとして必要な `recordType: "manifest"` / `recordType: "frame"` の committed `.ndjson` / `.jsonl` / `.ndjson.gz` / `.jsonl.gz` は worktree 内に見つからなかった。
- `tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md` は P0 index として正規だが、6 件すべて `Source: not-captured`、replay log path / metrics summary path は未生成で、real-camera evidence と扱わないよう明記している。
- `tasks/character-sincro-motion/task-260629225942-production-retarget-composer-motion-metrics-comparison/artifacts/composer-comparison/production-composer-comparison-summaries.not-captured.json` は P0 fixture ids を含むが、全 metric が `not_available` / `baseline_not_captured` / `replayLog.available: false` で、temporal primary vs pose fallback の comparison ではない。
- `tasks/character-sincro-motion/task-260705004405-torso-shoulder-composer-migration/artifacts/torso-shoulder-composer-migration-replay.json` は torso / shoulder 用の synthetic replay audit であり、production motion-debug P0 frames、raw result slot、Phase 6 temporal-vs-pose comparison metrics を含まない。
- `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionQaRegressionTestFixtures.ts` と replay/player/recorder tests は synthetic unit-test fixtures であり、captured production P0 fixture ではない。
- historical Playwright / camera summary artifacts は summary JSON であり、motion-debug replay frames、`frame.mediapipe`、temporal / solver / metrics slots を持たないため、`neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`reachClampOccupancy` の temporal-primary vs pose-fallback comparison へ変換できない。

### Blocker

- P0 replay fixture metrics comparison の受け入れ条件は、現在の repository / worktree 内の実装だけでは充足不能。
- 不足している artifact は、production-like browser client で取得した P0 6 種の motion-debug recording、またはそれと同等に task.md 上「P0 replay fixture」として扱える正規 fixture。
- 必要な保存形は既存 manifest と同じく `artifacts/replay/<metrics-fixture-id>.ndjson` または `.ndjson.gz`、`artifacts/metrics/<metrics-fixture-id>.summary.json`、必要に応じて `.baseline.json`。各 replay は temporal primary と pose-snapshot fallback の両条件で `neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`reachClampOccupancy` を算出できる production frame / temporal / solver / metrics slot を含む必要がある。
- 次に必要な外部入力は、実機または production-like camera / video fixture session で `neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、`arms-cross`、`fast-wave` を recording し、同一入力を temporal primary と pose-snapshot fallback で評価した metrics summary。

### TypeScript production comment audit

- attempt 4 では TypeScript production code を変更していないため、新規 comment audit 対象はない。attempt 1 / 2 の audit 結果は維持。

### ドキュメント同期

- attempt 4 では公開 API、通信契約、公開挙動、design docs を変更していないため追加同期は不要。attempt 1 / 2 で同期済みの `motion.md` / `tracking.md` は維持。

### 検証

- `npm run gate`: PASS at clean SHA `e7caaa8`。`gate:lint` / `gate:build` / `gate:test` はすべて cache hit。frontend tests は 496 passed。

### コミット

- attempt 4 の worktree 変更はないため追加 commit は作成しない。現在の実装 commit は `e7caaa8`。

## attempt 5

### 判断

- 前回 evaluator の FAIL は captured production P0 replay fixture metrics comparison の一点であり、実装本体、fallback reason、Phase 6 `source`、旧 log 互換、docs / comment audit は概ね PASS 済みと確認した。
- 指定 worktree `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-cc415b27024e-A9HaHw` の branch `codex/task-260705214026-canonical-temporal-arm-solver-production` を現在基点 `feature/character-animation-3.0` へ merge し、merge commit `56d0db4` を作成した。
- merge conflict は `documents/design/frontend/character/motion.md` と `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts` の 2 件。最新 main 側の full normalized pose production default と Gesture reliability / viewer 分割の変更を尊重し、temporal arm primary の設計記述と `retarget(..., { temporal, profile })` だけを維持した。
- review.md 申し送りどおり、削除済みの arm / torso / full application staged rollback flags は復活させていない。`VRMCharacterManager.update()` の root block は最新 main の `CharacterMotionOrchestrator.updateRootStabilization()` 経路を採用した。
- 最新基点込みで P0 replay fixture / recording / metrics generator を再調査したが、task.md が要求する captured production P0 replay fixture metrics comparison を正当に満たす artifact は repository 内に存在しない。synthetic artifact や `not-captured` summary を正規 P0 として扱わない判断を維持する。

### P0 replay fixture 再調査範囲

- `find` で repository 内の `.ndjson` / `.ndjson.gz` / `.jsonl` / `.jsonl.gz`、`recording`、`replay`、`fixture` 名の committed artifact を確認した。production motion-debug replay log として扱える NDJSON / JSONL は見つからなかった。
- `rg` で `P0`、`production replay`、`captured`、`not-captured`、`neutralJitter`、`elbowFlip`、`recoveryJump`、`reachClampOccupancy`、`calculateReplayMetrics`、`runQaRegression` を `tasks/`、`documents/`、`sincromisor-frontend/src/` から再検索した。
- `task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md` は現在基点でも 6 fixture すべて `Source: not-captured`、replay log path / metrics summary path は未生成で、実 camera evidence と扱わないよう明記している。
- `task-260629225942-production-retarget-composer-motion-metrics-comparison/artifacts/composer-comparison/production-composer-comparison-summaries.not-captured.json` は 6 P0 fixture id を含むが、全 metric が `not_available` / `baseline_not_captured` / `replayLog.available: false` で、temporal primary vs pose-snapshot fallback comparison ではない。
- `task-260705004405-torso-shoulder-composer-migration/artifacts/torso-shoulder-composer-migration-replay.json` は torso / shoulder synthetic audit であり、production P0 replay frames、raw result slot、Phase 6 temporal-vs-pose comparison metrics を含まない。
- 最新 main で追加された motion-debug viewer split / Gesture reliability 関連の tests と fixtures は viewer / unit-test 用であり、captured production P0 replay fixture ではない。

### Blocker

- P0 replay fixture metrics comparison の受け入れ条件は、現在の repository / worktree 内の実装だけでは充足不能。
- 不足している artifact は、production-like browser client で取得した P0 6 種の motion-debug recording、または task.md 上「P0 replay fixture」として扱える正規 fixture。
- 必要な保存形は既存 manifest と同じく `artifacts/replay/<metrics-fixture-id>.ndjson` または `.ndjson.gz`、`artifacts/metrics/<metrics-fixture-id>.summary.json`、必要に応じて `.baseline.json`。各 replay は temporal primary と pose-snapshot fallback の両条件で `neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`reachClampOccupancy` を算出できる production frame / temporal / solver / metrics slot を含む必要がある。

### TypeScript production comment audit

| path                                                                     | symbol or decision                            | kind                         | current comment                                                                                                                                               | decision | required maintenance knowledge                                                                                                                   | action                                                                                                    | reviewer note                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts` | `VRMCharacterManager.update()` merge boundary | lifecycle / runtime boundary | class / helper comments describe full normalized pose application as single production writer and unavailable reason as observation, not staged fallback hook | keep     | temporal/profile を retargeter 第 3 引数へ渡す一方、full application unavailable frame で旧 arm / torso staged writer を復活させないこと         | conflict resolution で `retarget(..., { temporal, profile })` と `updateRootStabilization()` の両方を維持 | `motionOrchestrator.update()`、arm / torso staged mode fields、full application mode field が復活していないこと |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts` | `applyFullNormalizedPoseApplication()`        | public export / lifecycle    | production writer としての TSDoc があり、失敗条件と非対象を明記している                                                                                       | keep     | full application 失敗は Debug Console / metrics 用 unavailable reason に閉じ、fallback writer 起動条件にしないこと                               | merge による既存 comment を維持。追加 JSDoc は不要                                                        | helper signature に旧 mode / rollback option が無いこと                                                         |
| `documents/design/frontend/character/motion.md`                          | temporal primary vs deleted staged flags      | design doc sync              | merge conflict で旧 arm / torso staged flag 説明と最新 deleted-staged-path 説明が衝突                                                                         | rewrite  | 腕 IK target は temporal bridge primary / pose-snapshot fallback。Hand wrist は主入力にせず、arm / torso / full staged rollback flags は削除済み | 最新 deleted-staged-path 記述を残し、その直後に temporal arm primary / pose fallback 境界を追記           | design doc が reviewer 申し送りの `motion.md:50,79` と `tracking.md:122` 系の正本記述を崩していないこと         |

TODO は追加していない。stale comment は、merge conflict resolution の範囲で旧 staged rollback path を復活させない形に整理した。

### ドキュメント同期

- merge conflict resolution として `documents/design/frontend/character/motion.md` を同期した。最新 main の full normalized pose production default / staged rollback flags 削除済みの説明を維持し、temporal bridge primary / pose-snapshot fallback / Hand wrist 非採用の境界を残した。
- 公開 WebRTC / backend contract、DataChannel payload、server code は変更していないため追加同期は不要。

### 検証

- `npm run gate`: PASS at clean SHA `56d0db4`。`gate:lint` は Biome / Markdown check PASS、`gate:build` は TypeScript / Vite build PASS、`gate:test` は 70 files / 487 tests passed。

### コミット

- `56d0db4` `chore(character): merge current animation base`
    - current base merge、conflict resolution、temporal arm primary と最新 full normalized pose production path の両立。

### 未実行 / 残リスク

- captured production P0 replay fixture metrics comparison は未実行。repository 内に正規 P0 replay fixture / recording / metrics summary が無いため。実機または production-like camera / video fixture session で P0 recording を取得するまで、現 task.md の受け入れ条件は満たせない。

## attempt 1 (2026-07-12 rerun)

### 判断

- 既存 implementation branch `codex/task-260705214026-canonical-temporal-arm-solver-production` の HEAD `56d0db4` を再利用した。実装本体、focused tests、design docs、comment audit は直近 evaluator で受け入れ条件を満たすと確認済みであり、今回の基点 `2f5d2a4` との差分にも新たな production contract 変更はない。
- full `VrmPoseComposer` application が唯一の upper-body final pose writer である現行構成を維持した。削除済み `ArmBoneController`、torso staged writer、rollback flag は復活させていない。
- `motionDebugViewerSolverLayer.ts` を含む現行 viewer/parser 側では Phase 6 `source` 欠損を legacy pose fallback として扱う実装・test が branch に取り込まれている。temporal/profile 欠損は provider で独立 reason として保持し、`VRMCharacterManager.update()` は `toMinimalAvatarMotionProfile()` と pipeline temporal を個別に runtime input へ渡す。
- captured production P0 replay fixture は引き続き repository 内に存在せず、実装変更だけでは当該受け入れ条件を充足できない。synthetic comparison を captured evidence と偽装せず、外部入力が必要な blocker として維持する。

### P0 metrics comparison

- 保存済み synthetic artifact `artifacts/p0-temporal-vs-pose-fallback-metrics-comparison.synthetic.json` では neutral jitter、elbow flip count、recovery jump、reach clamp occupancy はすべて regression なし。
- ただし artifact 自身が `realP0ReplayCapture: not_available` と明示しており、captured production P0 replay fixture による comparison の代替にはしない。

### TypeScript production comment audit

| path                                                                               | symbol or decision                                 | kind                             | current comment                                      | decision | required maintenance knowledge                                                                                                                         | action                     | reviewer note                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------ |
| `sincromisor-frontend/src/character/retargeting/sincroPoseTemporalArmInput.ts`     | production input provider / fallback reason policy | public export / runtime boundary | TSDoc 済み                                           | keep     | temporal primary は canonical/temporal/profile/solver measurement 起点で、Pose/Hand wrist は primary に使わない。欠損 reason は field ごとに保持する。 | 既存 TSDoc と tests を維持 | temporal/profile 独立欠損と invalid/lost fallback を covered |
| `sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts`           | `solveWorldArmIk`                                  | deprecated fallback lifecycle    | `@deprecated` と削除条件を記載済み                   | keep     | captured P0 A/B comparison と fallback cleanup 完了までは pose-snapshot fallback を削除しない。                                                        | 変更なし                   | primary path へ戻さないこと                                  |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts`           | Hand wrist 非採用                                  | production policy                | runtime/provider TSDoc 済み                          | keep     | Hand は reliability/finger/gesture の補助入力で、arm target ownership を持たない。                                                                     | input shape を維持         | Hand snapshot dependency なし                                |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`           | composer ownership                                 | lifecycle / ownership            | full application の単一 writer contract を記載済み   | keep     | temporal arm input 切替は retarget input の変更に閉じ、upper-body final pose writer を増やさない。                                                     | 変更なし                   | staged writer / rollback flag なし                           |
| `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts` | optional `source` / legacy display                 | replay compatibility             | v1 optional field と legacy normalization を記載済み | keep     | schema version を上げず、source 欠損旧 log は pose-snapshot fallback 表示にする。                                                                      | parser/viewer tests を維持 | `motionDebugViewerSolverLayer.ts` と同期済み                 |

TODO は追加していない。今回 production TypeScript の変更はなく、既存 public export、runtime boundary、coordinate/scale heuristic、fallback lifecycle の TSDoc は current branch で維持されている。

### 検証

- `npm run gate`: PASS at clean SHA `56d0db4`。lint/build/test は content-addressed cache hit、frontend tests は 487 passed。
- worktree は clean。今回 implementation branch への追加 commit は不要。

### Blocker

- captured production P0 replay fixture、または task.md 上で正規 P0 fixture と定義された同等入力が必要。これが提供されるまで現 task.md の P0 comparison 条件は満たせない。

## attempt 2 (2026-07-12 rerun)

### 判断

- 最新 `eval.md` の attempt 1 FAIL を確認し、残課題を captured production P0 replay fixture comparison の一点に限定した。
- worktree 全体から `.ndjson`、`.ndjson.gz`、`.jsonl`、`.jsonl.gz` を再検索したが、committed production capture は 0 件だった。unit/acceptance test 内の生成文字列は synthetic fixture であり、正規 capture evidence にはしない。
- 正本 `production-sincro-baseline-manifest.md` は P0 6 fixture の source をすべて `not-captured` と明記し、replay log / metrics summary は未生成としている。この policy をコード変更で迂回することは受け入れ条件の弱体化になるため行わない。
- 現行 capture/replay API は既に存在し、追加コードで解消する欠落ではない。必要なのは production-like browser の camera/video 入力と、同一入力を temporal primary / pose-snapshot fallback の両条件で取得する外部実行である。

### 正規 capture / replay 経路

1. production-like client の `motion-debug` を起動し、`window.__SINCRO_MOTION_DEBUG__.startCamera()` または信頼できる実写 video fixture に対する `loadVideoFixture(url)` を使う。
2. P0 fixture ごとに `startRecording()`、所定 motion、`stopRecording()`、`downloadRecording()` を実行し、manifest + frame の motion-debug NDJSON を保存する。
3. 保存 recording を `loadRecording(fileOrText)` で読み、`calculateReplayMetrics({ fixtureId, generatedAtIso, ... })` または `runQaRegression(...)` で summary を生成する。fixture id は `neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、`arms-cross`、`fast-wave` のいずれかを明示し、暗黙の neutral fallback は使わない。
4. 同一 camera/video input を temporal primary と pose-snapshot fallback の両条件で評価し、`neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`reachClampOccupancy` を比較する。
5. replay を `artifacts/replay/<fixture-id>.ndjson[.gz]`、summary を `artifacts/metrics/<fixture-id>.summary.json` に保存し、baseline manifest の source/path を captured evidence として更新する。camera の raw `deviceId`、`groupId`、`label` は保存しない。

### Blocker

- 現 workspace には camera session、承認済み production recording、信頼できる実写 video fixture のいずれも存在しない。この外部入力なしでは、既存 API を呼んでも `no_recording_loaded` となるか synthetic test log を評価するだけであり、AC を正当に満たせない。
- task.md を変更せず完了するには、上記 6 fixture の captured replay と temporal/fallback 両条件の metrics summary が必要。外部 capture を不要とするなら task.md と design docs の evidence policy を改訂し、再レビューが必要。

### 実装・検証

- production code / tests / docs の追加変更はなし。外部入力の不在はコード修正では解消できない。
- implementation branch HEAD は `56d0db4` のまま。attempt 1 rerun の `npm run gate` は clean SHA で PASS（487 tests）しており、worktree は clean。

## attempt 3 (2026-07-12 real-video follow-up)

### 実装

- 実写6 fixtureの初回実行で、実装buildの全frameが`temporal_input_missing`によりPose fallbackへ落ちることを確認した。
- `motion-debug` recorder/viewerが計算したtemporal stateを`CharacterBehaviorState`へ同期し、production `VRMCharacterManager.update()`と同じretarget runtime inputへ渡すよう修正した。
- source停止時はmotion pipelineをclearし、前fixtureのtemporal/Handを持ち越さない。
- commit: `ff0edef9` (`fix(frontend): publish motion debug temporal state`)。

### 検証

- focused tests: 3 files / 19 tests PASS。
- `npm run gate`: lint/build/test PASS、71 files / 488 tests。
- 実写6 fixture再実行: candidate 595 framesの左右すべてが`primarySource: temporal`、Pose fallback 0 frames。
- artifacts: `artifacts/replay/`、`artifacts/metrics/`、`artifacts/p0-real-video-capture-2026-07-12.md`、`artifacts/p0-temporal-vs-pose-fallback-metrics-comparison.real-video.json`。

### 判定

- real-video comparison verdictは`FAIL`。
- `solverElbowFlipRejectCount`が全6 fixtureでregression（baseline 0–2、candidate 117–196）。
- `arms-cross`の`solverReachClampOccupancy`が約`0.649`から`0.867`へregression。
- recovering temporal sampleが無く、recovery jumpはnot comparable。
- temporal input接続不備は解消したが、temporal elbow-pole安定性を調整しない限り本タスクの非regression条件は満たせない。

## attempt 4 (2026-07-12 elbow-pole stabilization)

### 実装

- 初回の有効な temporal elbow pole を bind pole と比較して reject せず、その測定値を履歴の基準として bootstrap するよう修正した。Pose snapshot 経路の既存 refinement 判定は維持した。
- 腕がほぼ伸び切り、elbow plane が幾何的に不定となる区間では hard flip reject と soft downweight を行わない。表示 state は従来どおり `extended` とする。
- temporal primary と pose-snapshot fallback の切替時に solver の pole 履歴だけを reset し、異なる座標基準の pole を frame 間比較しないようにした。
- commit: `3b5cfa81` (`fix(frontend): stabilize temporal elbow pole history`)。

### 検証

- `npm run gate`: lint/build/test PASS、71 files / 490 tests。
- 確定commitで実写6 fixtureを再取得。左右合計1220 arm framesが`primarySource: temporal`、Pose fallback 0 frames。
- neutral jitter: `0.024490` → `0.023117` で改善。
- solver elbow flip reject: neutral `0 → 0`、single raise `0 → 0`、both raise `0 → 0`、hand return `0 → 0`、arms cross `0 → 1`、fast wave `2 → 0`。初回の117–196件という回帰は解消した。
- reach clamp occupancy: arms crossのみ `0.648551 → 0.873134` で引き続き回帰。他5 fixtureはbaseline以下またはneutral同値。
- recovering temporal sampleは今回も0件で、recovery jumpは比較不能。

### 判定

- real-video comparison verdictは引き続き`FAIL`。elbow-pole修正自体は有効だが、受け入れ条件の全metric非回帰には未達。
- 残る blocker は arms-cross の elbow flip 1件、reach clamp occupancy回帰、およびrecovery sample不在。reach上限を0.97/0.94へ縮める試行は実写occupancyを安定して改善せず、腕長を短縮する副作用に根拠がないため採用しなかった。
