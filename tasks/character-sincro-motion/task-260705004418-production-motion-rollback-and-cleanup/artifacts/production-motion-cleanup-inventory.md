# Production Motion Cleanup Inventory

## Dependency Confirmation

`task-260705004415-full-normalized-pose-application` は `status: done` / `verdict: PASS` / `attempts: 3`。
PASS artifact:

`tasks/character-sincro-motion/task-260705004415-full-normalized-pose-application/artifacts/full-normalized-pose-application-verification.md`

cleanup 開始条件は満たされている。

## Inventory

| item                                                              | kind                                    | current state                                                                                                                            | decision                  | owner                          | deletion condition                                                                                                                                                         | synced location                                                        |
| ----------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `composerArmApplicationMode`                                      | temporary rollback flag                 | Debug Console 限定。通常設定 UI / URL query / env / backend API / 保存設定 contract には出していない。                                   | 残置                      | motion runtime                 | full application default 昇格後も arm stage へ戻す runbook が不要になり、P0 replay、camera degradation / recovery、chat / sincro mode 切替、複数 VRM 実機確認が継続 PASS。 | `sincroPoseRetargetTypes.ts` TSDoc、`motion.md`、runtime ownership map |
| `composer_arm_application_*` warnings                             | rollback reason                         | Debug Console の composer dry-run summary に合流。                                                                                       | 残置                      | motion runtime                 | arm rollback flag 削除と同時。warning だけ先に消さない。                                                                                                                   | rollback runbook、runtime ownership map                                |
| `composerTorsoShoulderApplicationMode`                            | temporary rollback flag                 | Debug Console 限定。direct torso controller へ戻す hook。                                                                                | 残置                      | motion runtime                 | torso / shoulder direct controller rollback が不要化し、head / neck / leg / expression 非対象を維持した実機確認が揃う。                                                    | `sincroPoseRetargetTypes.ts` TSDoc、`motion.md`、runtime ownership map |
| `composer_torso_shoulder_application_*` warnings                  | rollback reason                         | profile 欠損、upperArm fallback、finalPose / node 欠損を summary に出す。                                                                | 残置                      | motion runtime                 | torso / shoulder rollback flag 削除と同時。                                                                                                                                | rollback runbook、runtime ownership map                                |
| `composerSemanticFingerApplicationMode`                           | temporary rollback flag                 | 既定 `"composer"`。`"off"` は MotionIntent / Hand observe を残して semantic / finger layer だけ外す。                                    | 残置                      | motion runtime                 | semantic / finger regression の rollback が不要になり、reduced finger chain と Hand lost / recovered が継続 PASS。                                                         | `sincroPoseRetargetTypes.ts` TSDoc、`motion.md`                        |
| `semantic_finger_application_*` warnings                          | rollback reason / debug-only comparison | invalid intent、Minimal profile、Hand 欠損、mode off を説明する。                                                                        | 残置                      | motion runtime                 | semantic / finger flag 削除と同時。parser / Hand 欠損 warning は layer 抑制理由として必要な間は残す。                                                                      | rollback runbook、`sincroVrmPoseComposerSemanticFingerLayers.ts`       |
| `fullNormalizedPoseApplicationMode`                               | temporary rollback flag                 | Debug Console 限定。既定 `"upper_body"` は current available result だけ full apply し、`"off"` は段階別 path へ戻す明示 rollback mode。 | 残置                      | motion runtime                 | default 昇格後も P0 replay、camera degradation / recovery、chat / sincro mode 切替、複数 VRM が継続 PASS し、staged rollback runbook が不要化。                            | `sincroPoseRetargetTypes.ts` TSDoc、`motion.md`、runtime ownership map |
| `full_normalized_pose_application_*` warnings                     | rollback reason                         | stale result を current result にせず、段階別 path へ戻った理由を summary に出す。                                                       | 残置                      | motion runtime                 | full rollback flag 削除と同時。`status !== "available"` result 欠損 contract が残る限り warning は残す。                                                                   | rollback runbook、runtime ownership map                                |
| `SincroVrmPoseComposerDryRunResult.fullNormalizedPoseApplication` | debug-only metadata                     | manager 側の full application 結果を dry-run summary に annotation する。                                                                | 残置                      | motion runtime / Debug Console | Debug Console から full rollback reason を見る必要がなくなった時。                                                                                                         | `motion.md`、comment audit                                             |
| `summarizeComposerDryRun()` compressed summary                    | debug-only comparison surface           | finalPose 全体ではなく warning / suppressed / clamped / full metadata だけ常時表示。                                                     | 残置                      | Debug Console                  | composer comparison と full rollback reason を別 artifact で十分追えるようになった時。                                                                                     | `motion.md`、comment audit                                             |
| stale finalPose promotion                                         | stale fallback path                     | `status !== "available"` では result を返さず、previous finalPose を current result にしない。                                           | 削除済み相当 / 再導入禁止 | motion runtime                 | なし。再導入しない。                                                                                                                                                       | `sincroVrmPoseComposerDryRun.ts` TSDoc、rollback runbook               |
| old direct write fallback path                                    | production fallback                     | arm / torso は rollback hook として残す。full unavailable では staged writer 前に identity clear してから戻る。                          | 残置                      | motion runtime                 | default 昇格後の継続確認で、direct writer へ戻す復旧手順を廃止できる時。                                                                                                   | runtime ownership map、rollback runbook                                |
| head / neck / leg / expression non-target boundary                | ownership boundary                      | full upper body finalPose の対象外。Face / Eye / Mouth / Emotion / Leg / root は従来 controller 所有。                                   | 残置                      | motion runtime                 | 本 task では対象外。変更する場合は別 task。                                                                                                                                | `motion.md`、runtime ownership map                                     |
| public WebRTC / backend contract                                  | public contract                         | 変更なし。                                                                                                                               | 対象外                    | RTC / backend                  | 本 task では扱わない。                                                                                                                                                     | `task.md`、`impl.md`                                                   |

## Deleted Production Code

この attempt で production code から削除した writer / flag / warning はない。

理由:

- full application PASS artifact は確認済みだが、この cleanup worktree には captured P0 replay log と実機 visual
  QA artifact が無い。
- rollback runbook は arm、torso / shoulder、semantic / finger、full finalPose の各段階へ戻す手順を必要としている。
- stale finalPose promotion は既に禁止されており、削除対象の stale fallback path は現行 production code には無い。

## Follow-up Candidates

| candidate                              | reason                                                                                                          | proposed follow-up                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| full application 継続確認              | default は `"upper_body"` へ昇格済み。通常設定 contract に広げず、developer flag の rollback 手順を残している。 | P0 replay / real VRM visual artifact を default path で継続収集する。             |
| staged rollback flag 削除              | runbook でまだ復旧 hook として使う。                                                                            | default 昇格後、一定期間の metrics / visual PASS を確認して削除 task を起票する。 |
| Debug Console composer comparison 縮小 | rollback reason の観測口として必要。                                                                            | rollback flag 削除時に summary metadata と UI controls を同時整理する。           |

## Attempt 2 Verification Status

`artifacts/production-motion-cleanup-verification.md` に追加証跡を記録した。

- focused harness: 7 files / 90 tests PASS。
- P0 fixture replay / composer metrics: synthetic motion QA regression、composer comparison metrics、motion-debug
  replay / metrics viewer tests を PASS。
- camera degradation / recovery: degradation policy と tracker runtime recovery tests を PASS。
- multiple VRM browser smoke: `/motion-debug/?vrm=/characters/default.vrm` と
  `/motion-debug/?vrm=/characters/aoi-1.0.7.vrm` で canvas と window API、console error 0 を確認。
- chat / sincro mode switch: `/simple-vrm/` で RTC config endpoint を contract-compatible payload で mock し、
  chat / sincro select と staged / full rollback controls の DOM switch、console error 0 を確認。

実カメラ session と実 backend RTC 接続は未実行だが、camera recovery と mode / rollback control の境界は
既存 harness と Playwright smoke の代替確認で PASS とした。

## Documentation Sync

- `documents/design/frontend/character/motion.md`: rollback hook の現状、削除条件の導線、public contract 非変更を同期。
- `tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md`:
  cleanup status、残置理由、stale finalPose 禁止、非対象境界を同期。
- `artifacts/production-motion-rollback-runbook.md`: 段階別 rollback 手順、確認コマンド、metrics 確認を記録。

公開 WebRTC / backend 契約、DataChannel payload、server code、通常設定保存 contract は変更していない。
