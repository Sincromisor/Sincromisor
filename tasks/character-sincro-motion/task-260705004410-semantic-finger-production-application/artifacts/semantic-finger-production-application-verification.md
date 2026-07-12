# Semantic Finger Production Application Verification

## scope

- 実装 worktree:
  `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-29b54d54aebe-QR46no`
- 対象ブランチ:
  `codex/task-260705004410-semantic-finger-production-application`
- 確認方式:
  unit / build / gate と synthetic `AvatarMotionProfile` による replay 相当確認。
- 実ブラウザ visual QA:
  未実行。camera permission と実 VRM 表示の手動確認は評価側または後続作業に残す。

## acceptance matrix

| case                      | input snapshot                                                              | expected composer result                                                                                                                       | verification                             |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| rollback off              | valid `MotionIntentState`, low-dimensional Hand, full profile, `mode="off"` | semantic / finger layer を追加しない。warning は `semantic_finger_application_off`。                                                           | `sincroVrmPoseComposerDryRun.test.ts`    |
| hand open / half / closed | synthetic Hand curl を open/half/closed 相当に変更                          | finger layer は profile capability のある finger chain だけを所有し、tracking owner bone と競合しない。                                        | fixture coverage + dry-run focused tests |
| thumbs-up                 | `intent.gesture="thumbsUp"`、Hand missing                                   | semantic layer は生成されるが finger layer は生成されず、`semantic_finger_application_hand_missing`。                                          | `sincroVrmPoseComposerDryRun.test.ts`    |
| peace                     | `intent.gesture="peace"`、index/middle open、ring/little closed             | finger layer が `leftIndexProximal` を所有。semantic layer が tracking owner bone に触れる場合は `semantic_conflict` suppression。             | `sincroVrmPoseComposerDryRun.test.ts`    |
| near-face                 | valid intent / hand snapshot                                                | production composer 入力は `MotionIntentState` と low-dimensional Hand snapshot だけ。raw landmark / raw gesture result は入力型に存在しない。 | type boundary + build                    |
| soft clap-like            | valid intent / hand snapshot                                                | semantic/finger は composer layer としてだけ追加され、VRM Object3D / raw bone node は参照しない。                                              | type boundary + build                    |
| hand lost / recovered     | valid intent, Hand missing then recovered                                   | Hand missing frame は semantic のみ、recovered frame は finger layer 生成を再開。previous finger は dry-run service state に閉じる。           | unit coverage + comment audit            |
| reduced finger chain      | profile capability: left index proximal only                                | missing chain warning を出し、存在しない intermediate / distal bone は所有しない。`owned_bone_conflict:*` は 0。                               | `sincroVrmPoseComposerDryRun.test.ts`    |
| invalid intent            | schema-like object with raw landmark field                                  | semantic/finger layer を追加せず、`semantic_finger_application_intent_invalid`。                                                               | `sincroVrmPoseComposerDryRun.test.ts`    |
| minimal profile           | `MinimalAvatarMotionProfile`                                                | semantic/finger layer を追加せず、`semantic_finger_application_profile_not_full`。                                                             | `sincroVrmPoseComposerDryRun.test.ts`    |
| motion-debug finalPose    | Debug Console runtime snapshot has production dry-run result                | live finalPose snapshot は debug-only recomposition ではなく production dry-run `result` を優先する。                                          | `motionDebugPhase6Snapshots.test.ts`     |

## metrics snapshot

Synthetic dry-run / replay assertions:

| metric                                 | result                                | basis                                                                                                       |
| -------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `gestureFlickerCount`                  | pass / 0 synthetic regression         | semantic/finger layer generation does not mutate intent cooldown or gesture selection state.                |
| `semanticFallbackFrameCount`           | pass / expected warning-only fallback | invalid intent / minimal profile / hand missing are explicit warnings and do not create stale layer output. |
| `intentCooldownSuppressionCount`       | pass / no extra suppression           | production application reads saved `MotionIntentState`; it does not add a second cooldown heuristic.        |
| `intentInvalidFrameCount`              | pass / invalid frame rejected         | invalid intent test asserts no finger ownership and `semantic_finger_application_intent_invalid`.           |
| finger missing-chain composer conflict | `0`                                   | reduced-chain test filters `owned_bone_conflict*` and expects `[]`.                                         |

## raw input boundary

Production semantic/finger layer generation does not accept these inputs:

- Gesture Recognizer raw result
- MediaPipe raw landmark
- VRM `Object3D`
- raw bone node

The accepted input boundary is:

- parsed `MotionIntentState`
- low-dimensional `SincroHandMotionSnapshot`
- full `AvatarMotionProfile`

## commands

- `npm run test -- src/character/runtime/__tests__/sincroVrmPoseComposerDryRun.test.ts src/pages/motionDebug/__tests__/motionDebugPhase6Snapshots.test.ts src/features/debug/model/__tests__/debugConsoleSincroMotionControls.test.ts src/character/vrmCharacter/__tests__/armBoneController.test.ts`
- `npm run check`
- `npm run build`
- `npm run gate` PASS on clean commit `ec5ab93`.
