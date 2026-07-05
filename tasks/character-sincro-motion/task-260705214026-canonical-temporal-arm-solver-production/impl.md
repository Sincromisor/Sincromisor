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
