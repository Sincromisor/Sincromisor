# Production Motion Cleanup Inventory

## Dependency Confirmation

`task-260705004415-full-normalized-pose-application` は `status: done` / `verdict: PASS` / `attempts: 3`。
PASS artifact:

`tasks/character-sincro-motion/task-260705004415-full-normalized-pose-application/artifacts/full-normalized-pose-application-verification.md`

cleanup 開始条件は満たされている。

## Inventory

| item                                                              | kind                                    | current state                                                                                                                        | decision                  | owner                          | deletion condition                                                                                                 | synced location                                                  |
| ----------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `composerArmApplicationMode`                                      | temporary rollback flag                 | Debug Console control / snapshot / config から削除済み。                                                                             | 削除済み                  | motion runtime                 | 満了。full application default の継続 PASS を受け、arm stage へ戻す production fallback を廃止した。               | `sincroPoseRetargetTypes.ts`、`motion.md`、runtime ownership map |
| `composer_arm_application_*` warnings                             | rollback reason                         | production code / Debug Console summary から削除済み。                                                                               | 削除済み                  | motion runtime                 | 満了。`ArmBoneController.update()` は full unavailable frame の fallback trigger ではない。                        | rollback runbook、runtime ownership map                          |
| `composerTorsoShoulderApplicationMode`                            | temporary rollback flag                 | Debug Console control / snapshot / config から削除済み。                                                                             | 削除済み                  | motion runtime                 | 満了。torso / shoulder direct controller へ戻す production fallback を廃止した。                                   | `sincroPoseRetargetTypes.ts`、`motion.md`、runtime ownership map |
| `composer_torso_shoulder_application_*` warnings                  | rollback reason                         | production selected overwrite path とともに削除済み。                                                                                | 削除済み                  | motion runtime                 | 満了。`CharacterMotionOrchestrator.update()` は full unavailable frame の fallback trigger ではない。              | rollback runbook、runtime ownership map                          |
| `composerSemanticFingerApplicationMode`                           | temporary rollback flag                 | 既定 `"composer"`。`"off"` は MotionIntent / Hand observe を残して semantic / finger layer だけ外す。                                | 残置                      | motion runtime                 | semantic / finger regression の rollback が不要になり、reduced finger chain と Hand lost / recovered が継続 PASS。 | `sincroPoseRetargetTypes.ts` TSDoc、`motion.md`                  |
| `semantic_finger_application_*` warnings                          | rollback reason / debug-only comparison | invalid intent、Minimal profile、Hand 欠損、mode off を説明する。                                                                    | 残置                      | motion runtime                 | semantic / finger flag 削除と同時。parser / Hand 欠損 warning は layer 抑制理由として必要な間は残す。              | rollback runbook、`sincroVrmPoseComposerSemanticFingerLayers.ts` |
| `fullNormalizedPoseApplicationMode`                               | temporary rollback flag                 | Debug Console control / snapshot / config から削除済み。full application は production path として常時試行する。                     | 削除済み                  | motion runtime                 | 満了。`"off"` に戻す staged rollback mode は廃止した。                                                             | `sincroPoseRetargetTypes.ts`、`motion.md`、runtime ownership map |
| `full_normalized_pose_application_*` warnings                     | unavailable reason                      | `off` reason は削除済み。`unavailable:<status>` / `result_missing` / `vrm_missing` は Debug Console summary / metrics 観測用に残す。 | 一部削除 / 一部残置       | motion runtime                 | result 欠損 contract が残る限り unavailable reason は必要。旧 staged rollback trigger としては使わない。           | rollback runbook、runtime ownership map                          |
| `SincroVrmPoseComposerDryRunResult.fullNormalizedPoseApplication` | debug-only metadata                     | manager 側の full application 結果を `applied` / `unavailableReason` として dry-run summary に annotation する。                     | 残置                      | motion runtime / Debug Console | Debug Console / metrics から full unavailable reason を見る必要がなくなった時。                                    | `motion.md`、comment audit                                       |
| `summarizeComposerDryRun()` compressed summary                    | debug-only comparison surface           | finalPose 全体ではなく warning / suppressed / clamped / full metadata だけ常時表示。                                                 | 残置                      | Debug Console                  | composer comparison と full rollback reason を別 artifact で十分追えるようになった時。                             | `motion.md`、comment audit                                       |
| stale finalPose promotion                                         | stale fallback path                     | `status !== "available"` では result を返さず、previous finalPose を current result にしない。                                       | 削除済み相当 / 再導入禁止 | motion runtime                 | なし。再導入しない。                                                                                               | `sincroVrmPoseComposerDryRun.ts` TSDoc、rollback runbook         |
| old direct write fallback path                                    | production fallback                     | full unavailable frame で `ArmBoneController.update()` / `CharacterMotionOrchestrator.update()` を自動実行しない。                   | 削除済み                  | motion runtime                 | 満了。root stabilization は `updateRootStabilization()` に切り出して維持する。                                     | runtime ownership map、rollback runbook                          |
| head / neck / leg / expression non-target boundary                | ownership boundary                      | full upper body finalPose の対象外。Face / Eye / Mouth / Emotion / Leg / root は従来 controller 所有。                               | 残置                      | motion runtime                 | 本 task では対象外。変更する場合は別 task。                                                                        | `motion.md`、runtime ownership map                               |
| public WebRTC / backend contract                                  | public contract                         | 変更なし。                                                                                                                           | 対象外                    | RTC / backend                  | 本 task では扱わない。                                                                                             | `task.md`、`impl.md`                                             |

## Deleted Production Code

`task-260705214026-remove-motion-rollback-fallback-paths` で次を production code / Debug Console / tests から削除した。

- `composerArmApplicationMode` と arm selected overwrite path。
- `composerTorsoShoulderApplicationMode` と torso / shoulder selected overwrite path。
- `fullNormalizedPoseApplicationMode` と full application `"off"` rollback mode。
- full unavailable frame で `ArmBoneController.update()` / `CharacterMotionOrchestrator.update()` を自動実行する staged fallback trigger。
- `composer_arm_application_*`、`composer_torso_shoulder_application_*`、`full_normalized_pose_application_off`。

残置したもの:

- `composerSemanticFingerApplicationMode`。
- `semantic_finger_application_*` warnings。
- `full_normalized_pose_application_unavailable:<status>`、`full_normalized_pose_application_result_missing`、
  `full_normalized_pose_application_vrm_missing`。これらは Debug Console summary / metrics 用の unavailable reason であり、旧 staged writer を起動する trigger ではない。
- head / eye / mouth / emotion / leg / root position の controller ownership。

## Follow-up Candidates

| candidate                              | reason                                                                                            | proposed follow-up                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| semantic / finger rollback flag 削除   | semantic / finger regression rollback は arm / torso / full application rollback と別責務で残る。 | reduced finger chain と Hand lost / recovered の継続確認後。 |
| Debug Console composer comparison 縮小 | full unavailable reason と composer comparison は観測口としてまだ有効。                           | unavailable reason を別 artifact で追えるようになった時。    |

## Attempt 2 Verification Status

`artifacts/production-motion-cleanup-verification.md` に追加証跡を記録した。

- focused harness: 7 files / 90 tests PASS。
- P0 fixture replay / composer metrics: synthetic motion QA regression、composer comparison metrics、motion-debug
  replay / metrics viewer tests を PASS。
- camera degradation / recovery: degradation policy と tracker runtime recovery tests を PASS。
- multiple VRM browser smoke: `/motion-debug/?vrm=/characters/default.vrm` と
  `/motion-debug/?vrm=/characters/aoi-1.0.7.vrm` で canvas と window API、console error 0 を確認。
- chat / sincro mode switch: `/simple-vrm/` で RTC config endpoint を contract-compatible payload で mock し、
  chat / sincro select と rollback controls の DOM switch、console error 0 を確認。

実カメラ session と実 backend RTC 接続は未実行だが、camera recovery と mode / rollback control の境界は
既存 harness と Playwright smoke の代替確認で PASS とした。

## Documentation Sync

- `documents/design/frontend/character/motion.md`: rollback hook の現状、削除済み staged fallback、public contract 非変更を同期。
- `tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md`:
  cleanup status、残置理由、stale finalPose 禁止、非対象境界を同期。
- `artifacts/production-motion-rollback-runbook.md`: semantic / finger rollback 手順、full unavailable reason、metrics 確認を記録。

公開 WebRTC / backend 契約、DataChannel payload、server code、通常設定保存 contract は変更していない。
