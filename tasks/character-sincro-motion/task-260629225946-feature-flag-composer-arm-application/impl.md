# Implementation Log: task-260629225946-feature-flag-composer-arm-application

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断・申し送り対応

- review.md の申し送りどおり、`composerArmApplicationMode` は `SincroPoseRetargetConfig` に追加し、Debug Console の既存 `poseRetarget` config 経路で更新する実装にした。別 store は作っていない。
- `"off"` は `ArmBoneController` の direct write 後に即 return し、composer dry-run の `status` / `result` を読まず、composer arm application warning も生成しない形にした。production dry-run 自体は既存 observe-only 経路として従来どおり実行される。
- `"left"` / `"right"` / `"both"` は direct write を先に完了したうえで、対象腕の `upperArm` / `lowerArm` / `hand` だけを `finalPose` quaternion で上書きする。対象外腕、torso、shoulder、finger、head、expression は触らない。
- dry-run unavailable / result 欠損 / 対象 bone 欠損では direct write の結果を残し、Debug Console の composer dry-run warning summary に fallback reason を流す。
- mode 変更時は `VRMCharacterManager.setSincroPoseRetargetConfig()` で production dry-run service を reset し、前 mode の previous final pose を angular velocity clamp に持ち越さない。
- gate の Markdown check が既存別タスク `task-260629225942-production-retarget-composer-motion-metrics-comparison` の artifact 3 ファイルで失敗したため、worktree 側だけ Prettier 整形を含めた。実装判断は変更していない。

### 仕様からの逸脱

- なし。`setNormalizedPose(finalPose)` は呼ばず、限定 bone の direct quaternion copy に留めた。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に experimental flag、既定 `"off"`、対象 bone、fallback 条件、mode change reset、`setNormalizedPose()` 非使用を同期した。
- `documents/design/frontend/settings-and-debug-ui.md` に Debug Console 限定の developer flag であり通常設定 UI へ出さないことを同期した。
- 公開 API / WebRTC / env / compose 契約の変更はない。

### Verification

- `cd sincromisor-frontend && npm run test -- armBoneController`: PASS。
- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`: PASS。
- `cd sincromisor-frontend && npm run test -- debugConsoleSincroMotionControls`: PASS。
- `cd sincromisor-frontend && npm run check`: PASS。
- `cd sincromisor-frontend && npm run build`: PASS。
- `cd sincromisor-frontend && npm run test`: PASS, 57 files / 433 tests。
- `npm run gate`: PASS（dirty tree 実行。commit 後に再実行予定）。

### Comment Audit

| path                                                                                                                                              | symbol or decision                                    | kind                              | current comment                                       | decision | required maintenance knowledge                                                                                                                                                        | action                                                                                                              | reviewer note                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts`                                                                       | `ComposerArmApplicationMode`                          | public export / developer flag    | 既存なし                                              | add      | `"off"` は安定既定値、その他 mode は Debug Console / motion-debug 用実験経路。通常設定 UI や保存設定 contract ではない                                                                | TSDoc を追加                                                                                                        | mode union が `"off" \| "left" \| "right" \| "both"` に固定されていること                            |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts`                                                                       | `SincroPoseRetargetConfig.composerArmApplicationMode` | public config field               | 既存なし                                              | add      | dry-run available frame だけ対象腕 upperArm / lowerArm / hand を適用し、torso / shoulder / finger / head / expression は対象外。`"off"` では availability 確認も warning 生成もしない | field TSDoc と default を追加                                                                                       | `DEFAULT_SINCRO_POSE_RETARGET_CONFIG.composerArmApplicationMode === "off"`                           |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts`                                                                       | default `"off"`                                       | default / safety boundary         | 既存なし                                              | add      | developer flag の既定値は現行 direct write と同じ経路でなければならない。既定変更は表示挙動の破壊的変更                                                                               | `DEFAULT_SINCRO_POSE_RETARGET_CONFIG` に `"off"` を追加し、field TSDoc に安全条件を記録                             | default で composer arm application warning が出ないこと                                             |
| `sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts` / `debugConsoleSincroMotionRuntime.ts` / `sincroPoseRetargetControls.tsx` | Debug Console config path                             | public debug UI boundary          | 既存は pose retarget config の調整経路のみ            | add      | flag は既存 `poseRetarget` snapshot / `applySincroPoseRetargetConfig()` 経路で VRM runtime へ渡し、通常 settings store は増やさない                                                   | snapshot pick、default、update helper、select UI、回帰テストを追加。UI 部品の個別 TSDoc は内部 component のため省略 | `applySincroPoseRetargetConfig({ composerArmApplicationMode: "both" })` が snapshot に反映されること |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`                                                                            | `ComposerArmApplicationInput`                         | public export / boundary          | 既存なし                                              | add      | mode `"off"` では controller が `composerDryRun.status` / `result` を読まない。caller は production dry-run result をそのまま渡す                                                     | TSDoc を追加                                                                                                        | `"off"` テストで composer quaternion が適用されず warning も空であること                             |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`                                                                            | `ArmBoneControllerUpdateResult`                       | public export / observable output | 既存なし                                              | add      | observable output は Debug Console 用 warning。空配列は fallback なし、または direct write のみを表す                                                                                 | TSDoc を追加                                                                                                        | unavailable / missing bone warning が result に載ること                                              |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`                                                                            | `ArmBoneController` / `update()`                      | public class / lifecycle          | 既存 line comment は direct write の簡易説明だけ      | rewrite  | direct write が正本で、composer arm application は direct write 後の限定上書き。対象外や欠損時は direct write が残る                                                                  | JSDoc に rewrite                                                                                                    | 対象外腕が direct write のまま残ること                                                               |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`                                                                            | 対象 bone 限定                                        | ownership decision                | 既存なし                                              | add      | 適用対象は upperArm / lowerArm / hand の 3 bone のみ。shoulder fallback、torso、finger、head、expression は本 task の非対象                                                           | `COMPOSER_ARM_BONES` と class JSDoc に反映                                                                          | `COMPOSER_ARM_BONES` に shoulder / torso / finger が含まれないこと                                   |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`                                                                            | fallback to direct write                              | fallback                          | 既存なし                                              | add      | dry-run unavailable、result 欠損、bone 欠損では追加書き込みせず direct write を残す。Debug Console には短い warning を出す                                                            | helper 分岐、JSDoc、単体テストを追加                                                                                | `status: "not_ready"` と missing `leftLowerArm` の fallback test                                     |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`                                                                            | `setNormalizedPose()` を呼ばない判断                  | ownership decision                | 既存なし                                              | add      | 全面 normalized pose 適用は torso / shoulder / finger / head / expression の所有境界が揃うまで行わない                                                                                | class JSDoc と design doc に記録。実装は `Object3D.quaternion.copy()` のみ                                          | grep で `setNormalizedPose` 呼び出しが増えていないこと                                               |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`                                                                          | mode change reset                                     | lifecycle                         | 既存なし                                              | add      | flag 切替 frame で前 mode の `previousFinalPose` を angular velocity clamp 入力として使わない。腕適用自体は毎 frame direct write 後の上書きで残留 state を持たない                    | `setSincroPoseRetargetConfig()` に reset 分岐と実装コメントを追加                                                   | mode 変更時に `composerDryRun.reset()` が呼ばれること                                                |
| `documents/design/frontend/character/motion.md` / `settings-and-debug-ui.md`                                                                      | docs sync                                             | design doc sync                   | 既存は dry-run observe-only と Debug Console 方針のみ | add      | 公開表示挙動を変える developer flag の既定 off、対象 bone、fallback、Debug Console 限定、非対象を設計正本へ同期する必要がある                                                         | 2 文書へ追記                                                                                                        | ドキュメントがコードの mode / 対象 bone / fallback と一致すること                                    |

### Post-commit verification

- commit: `8b9fb8d7da33c1d6d3aa675a5bb4691b1ae30a2a`
- `npm run gate`: PASS（clean `8b9fb8d`、lint / build / test）。
