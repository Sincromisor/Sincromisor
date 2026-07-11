# Decide and remove semantic finger rollback hook

## 背景 / 目的

full normalized pose は唯一のproduction writerになったが、semantic/fingerだけdeveloper rollback flagが残る。実camera baselineが基準内ならflagとoff分岐を削除し、production経路を単一化する。

## 依存

`task-260712044932-capture-gesture-camera-performance-baseline` がPASS evidenceを持つこと。

## 完了条件（受け入れ条件）

- [ ] `/run-task` は依存taskが`status=done, verdict=PASS`のときだけ開始する。`artifacts/gesture-camera-baseline/metrics.json`の全gate boolean=trueと`verdict.md`のPASSを再確認し、不一致なら本taskは未着手/blockedとして停止してコードを変更しない。
- [ ] pass時は `ComposerSemanticFingerApplicationMode`、`SincroPoseRetargetConfig.composerSemanticFingerApplicationMode`とdefault、VRMCharacterManager field/config update、Debug Console snapshot/runtime/control、`off`分岐、`semantic_finger_application_off` warningと対応testsを削除し、valid inputではsemantic/finger composer layerを常時試行する。
- [ ] invalid intent、minimal profile、hand missingの既存suppression/warningは維持する。rollback削除をfallback削除と混同しない。
- [ ] settings/replay/recordingに旧flag保存contractがないことを確認し、存在する場合は旧値を無視する互換testを追加する。
- [ ] typecheckで旧symbol/string参照が0件、focused testsでvalid/invalid/minimal/missing handを固定し、full normalized poseのsingle writerを維持する。
- [ ] `documents/design/frontend/character/motion.md`、`overview.md`、roadmapのrollback記述を同期する。
- [ ] TypeScript production comment auditを `impl.md` に記録し、削除対象のstale rollbackコメントも全件削除/更新する。

## 設計判断（着手前に確定済み）

- baseline passを削除条件とする。新たな常設feature flagへ置換しない。
- semantic/finger input invalid時のsuppressionは安全境界なので残す。削るのはoperator-controlled off経路だけである。

## スコープ境界

- 本タスク: pass確認、rollback flag/control/warning削除、tests/docs/roadmap。
- 依存task: 実camera evidenceの取得だけを担う。
- スコープ外: gesture tuning、新semantic preset、finger mapping変更、arm/torso fallback復活。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:36-46` が削除条件付きrollback typeを定義する。
- 同 file `:123,145` がconfig field/defaultを所有する。
- `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:300-307` が毎frame modeをcomposerへ渡す。
- 同 file `:134-135,371-382` がruntime fieldとconfig updateを所有する。
- `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerSemanticFingerLayers.ts:66-80` にoff/invalid/profile分岐がある。
- `sincromisor-frontend/src/features/debug/react/panels/sincroPoseRetargetComposerControls.tsx:38-42`、`features/debug/model/debugConsoleSincroMotionRuntime.ts:146-148`、`features/debug/model/debugConsoleSnapshot.ts:80,288-289` がDebug Console control/stateを所有する。

## テスト

- frontend check/build/test、`rg`で旧symbol/warning 0件、`npm run gate`、`npm run tasks:check`。

## ドキュメント同期の要否

要。developer-visible rollback操作とroadmap残差が消えるため motion/overview/roadmapを同期する。通信契約は変更しない。

## Comment audit / 評価条件

`impl.md` に `path | symbol or decision | kind | current comment | decision(keep/rewrite/delete/add) | required maintenance knowledge | action | reviewer note` で全変更symbol/decisionを記録する。最低対象は上記inventory全symbol、常時semantic/finger input boundary、維持するinvalid/profile/hand-missing suppression。削除したrollbackを述べるstale commentは全件delete/rewriteし、省略理由も記録する。評価者は変更全件と`rg 'ComposerSemanticFingerApplicationMode|composerSemanticFingerApplicationMode|semantic_finger_application_off'` 0件を照合し、安全suppressionの失敗条件を欠くcomment、定型audit、実装不一致をFAILにする。
