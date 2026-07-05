# Production Motion Rollback Runbook

## Scope

この runbook は production `simple-vrm` / `sincro` motion の現行 rollback / unavailable 観測手順を記録する。
`task-260705214026-remove-motion-rollback-fallback-paths` で arm / torso / full application の staged rollback
flags は削除済みであり、残る明示 rollback hook は semantic / finger layer のみである。

開始条件:

- 依存 task `task-260705004415-full-normalized-pose-application` は `status: done` / `verdict: PASS`。
- PASS artifact は
  `tasks/character-sincro-motion/task-260705004415-full-normalized-pose-application/artifacts/full-normalized-pose-application-verification.md`。
- この cleanup では public WebRTC / backend 契約、DataChannel payload、server code は変更しない。

## Common Checks

rollback 前に確認すること:

- Debug Console の composer dry-run summary で `status`、`warnings`、`full applied` /
  `full unavailable <reason>` を確認する。
- head / neck / leg / expression / root position に regression が無いかを見る。
- `default.vrm`、`aoi-1.0.7.vrm`、欠損 bone synthetic profile のどれで再現するかを分ける。
- camera degradation / recovery、chat / sincro mode 切替でだけ再現するかを分ける。

確認コマンド:

```sh
npm run gate
npm run tasks:index
npm run tasks:index:check
npm run tasks:check
```

変更レイヤの高速確認:

```sh
cd sincromisor-frontend
npm run test -- src/character/vrmCharacter/__tests__/armBoneController.test.ts src/features/debug/model/__tests__/debugConsoleSincroMotionControls.test.ts
```

P0 replay / composer metrics は motion-debug の developer API で、P0 fixture
`neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、
`arms-cross`、`fast-wave` を対象に `runQaRegression(config)` と `calculateReplayMetrics(config)` を実行する。
この worktree には captured replay log が無いため、本 runbook では pass 扱いの metric 値は記録しない。

## Stage Rollback

| rollback target         | Debug Console setting                           | expected production path                                                                  | rollback condition                                                          | recovery check                                                                  |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| semantic / finger stage | `composerSemanticFingerApplicationMode = "off"` | MotionIntent / Hand observe は残すが semantic / finger layer を composer input から外す。 | semantic flicker、finger chain 欠損で例外、tracking pose を不透明に上書き。 | Hand open / half / closed、thumbs-up、peace、near-face、hand lost / recovered。 |

arm stage、torso / shoulder stage、full finalPose stage の Debug Console rollback setting は削除済みである。
full application unavailable frame では旧 staged writer へ戻さず、unavailable reason を観測して次の available
frame を待つ。head / eye / mouth / emotion / leg / root position は従来 controller で更新する。

## Rollback Reason Codes

残す rollback / unavailable reason:

- `invalid_torso_distribution_profile_defaulted`
- `semantic_finger_application_off`
- `semantic_finger_application_profile_not_full`
- `semantic_finger_application_intent_invalid`
- `semantic_finger_application_hand_missing`
- `full_normalized_pose_application_unavailable:<status>`
- `full_normalized_pose_application_result_missing`
- `full_normalized_pose_application_vrm_missing`

`invalid_torso_distribution_profile_defaulted` は composer dry-run layer generation の warning として残るが、
torso staged application rollback trigger ではない。stale finalPose を current result へ昇格する rollback は
禁止する。`status !== "available"` の `SincroVrmPoseComposerDryRunResult` は `result` を持たない contract のまま扱う。

## Recovery Metrics

復旧後に確認する metrics:

- motion metrics: `neutralJitter`、`trackingLossDurationMs`、`sideSwapCount`、
  `recoveryJumpAngleDeg`、`gestureFlickerCount`、`semanticFallbackFrameCount`。
- composer metrics: `composerAngleDeltaDeg`、`composerOwnedBoneConflictCount`、
  `composerMissingPoseFrameCount`、`finalPoseAngularVelocityClampCount`、
  `finalPoseOwnedBoneConflictCount`。
- degradation metrics: `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`,
  `degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount`。

`not_available` は pass とみなさず、fixture 欠損、recording 欠損、parser 欠損のいずれかを記録する。
