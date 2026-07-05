# Promote canonical temporal arm solver to production input

## 背景 / 目的

roadmap は、腕 IK の表示主経路がまだ `SincroPoseMotionSnapshot` の arm targets 起点に残っており、body-local canonical / temporal state から avatar shoulder-local target を作る構成への完全移行を継続対象としている。既存 task で `createTemporalArmIkInput()` は追加済みだが、production retarget はまだ `SincroPoseRetargeter.retarget(snapshot)` から `retargetPoseArm()` / `solveWorldArmIk()` を呼ぶ。

本タスクでは production `sincro` の arm solver input を canonical / temporal / profile 起点へ切り替え、Pose snapshot arm target は fallback と debug 比較に限定する。

## 完了条件（受け入れ条件）

- [ ] `SincroPoseRetargeter.retarget(snapshot, nowMs, options?)` に optional 第 3 引数を追加する。型は `SincroPoseRetargetRuntimeInput = { temporal?: TemporalUpperBodyState; profile?: MinimalAvatarMotionProfile }` に固定し、未指定時は現行 `retarget(snapshot, nowMs)` と同じ挙動にする。
- [ ] production arm solver input provider は `sincromisor-frontend/src/character/retargeting/sincroPoseTemporalArmInput.ts` に追加し、`createSincroPoseTemporalArmInput(input)` を export する。入力は `SincroPoseMotionSnapshot`、`TemporalUpperBodyState`、`MinimalAvatarMotionProfile`、既存 `SincroArmIkSolver` measurements、side に固定する。
- [ ] `VRMCharacterManager.update()` は `this.latestBehaviorSnapshot.sincroMotionPipeline?.temporal` と `toMinimalAvatarMotionProfile(this.sincroPoseRetargeter.getAvatarMotionProfile())` を `SincroPoseRetargeter.retarget()` の第 3 引数へ渡す。存在する値はそのまま渡し、欠損している field だけ `undefined` にする。provider は `temporal === undefined` なら `temporal_input_missing`、`profile === undefined` なら `avatar_profile_missing` を個別に debug snapshot へ残す。
- [ ] `TemporalUpperBodyState` が valid で `createTemporalArmIkInput()` が `target` を返す場合、left / right arm の primary IK target は temporal bridge result を使う。
- [ ] Temporal input 欠損、profile 欠損、bridge invalid / lost、solver missing の場合だけ既存 `SincroPoseMotionSnapshot.leftArm/rightArm.targets` 起点の fallback を使う。fallback reason は `temporal_input_missing`、`avatar_profile_missing`、`temporal_arm_lost`、`invalid_temporal_arm`、`ik_solver_missing` のいずれかを debug snapshot に残す。
- [ ] Hand wrist は production arm IK target の主入力にしない。Hand snapshot は reliability / finger / gesture の補助入力に限定する。
- [ ] debug / replay の Phase 6 solver snapshot は `sincro.phase6-solver.v1` を維持し、`MotionDebugPhase6ArmSolverSnapshot` へ optional `source` field を追加する。schema は `{ primarySource: "temporal" | "pose-snapshot-fallback"; fallbackReason?: string; bridgeReasonCodes: string[]; targetReachRatio?: number; temporalState?: TemporalPartState }` に固定する。
- [ ] 旧 log 互換として `source` 欠損の `sincro.phase6-solver.v1` は parse success とし、viewer では `primarySource: "pose-snapshot-fallback"` 相当の legacy 表示にする。schemaVersion は本タスクでは上げない。
- [ ] `VrmPoseComposer` へ渡る final normalized pose の bone ownership は変えない。同一 frame の最終 pose 書き手は引き続き composer / full application に集約する。
- [ ] 既存 `solveWorldArmIk()` は即削除しない。production fallback と A/B comparison が不要になったことを別 task で確認できるよう、deprecated fallback として残し、削除条件を comment audit と design docs に記録する。
- [ ] P0 replay fixture で temporal primary と pose fallback の metrics comparison を保存し、少なくとも neutral jitter、elbow flip count、recovery jump、reach clamp occupancy が regression していないことを `impl.md` に記録する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも production input provider、fallback reason policy、Hand wrist 非採用、deprecated pose-snapshot fallback、composer ownership を含める。
- [ ] comment audit 記録だけでは完了扱いにしない。新規 public export、runtime boundary、coordinate / scale heuristic、fallback lifecycle に必要な JSDoc/TSDoc の追加・更新、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- production primary は `SincroPoseRetargeter.retarget(snapshot, nowMs, { temporal, profile })` の第 3 引数から入る `TemporalUpperBodyState` + `MinimalAvatarMotionProfile` + `createTemporalArmIkInput()` に固定する。`SincroPoseMotionSnapshot` world target と temporal bridge の重み付き平均を primary にする案は、座標系と信頼度責務が混ざるため採用しない。
- provider の所在は `character/retargeting/sincroPoseTemporalArmInput.ts` に固定する。`motionSolver/` に production policy を置く案は、`motionSolver/temporalArmSolverBridge.ts` が pure helper であり production fallback / debug source policy を持たないため採用しない。
- Phase 6 solver snapshot は `sincro.phase6-solver.v1` の optional field 追加に留める。schemaVersion を上げる案は旧 log 互換 viewer と fixture 更新が大きく、既存 required field の意味を変えないため採用しない。
- fallback としての Pose snapshot arm target は本タスクでは残す。完全削除まで同時に行うと実カメラ regression 時の切り戻しが難しくなるため、削除は後続 cleanup task に分ける。
- `SincroPoseRetargetFrame` の外形は維持する。composer / Debug Console / metrics への影響を抑え、arm target source は solver debug snapshot に載せる。
- Hand wrist は読まない。roadmap と設計文書の方針どおり、腕 target は Pose / canonical / temporal 起点、Hand は palm / finger / gesture 補助に分ける。
- 公開 WebRTC / backend 契約、DataChannel payload、server code は変更しない。

## スコープ境界

- 本タスクでやること: production arm solver input provider、temporal primary 切替、pose fallback reason、debug / replay solver snapshot、metrics comparison、tests、docs sync。
- 本タスクでやらないこと: `solveWorldArmIk()` の完全削除、Gesture reliability、finger pose の新規挙動、full normalized pose application の ownership 変更、backend / WebRTC 契約変更。
- 依存タスクとの境界: `task-260625231726-character-animation-3-phase-6-temporal-arm-solver-bridge` が temporal bridge helper を提供済み。本タスクは production arm input をその helper へ切り替える。

## 実装方針（既存コード整合: file:line）

- 現行 production retarget は `SincroPoseRetargeter.retarget(snapshot, nowMs)` で `retargetPoseArm({ arm: snapshot.leftArm })` と `retargetPoseArm({ arm: snapshot.rightArm })` を呼ぶ（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:99`、`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:120`）。
- `solveWorldArmIk()` は Pose snapshot の shoulder / wrist / elbow world target と `config.armIkTargetScale` を使って solver target を作る（`sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts:41`、`sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts:51`）。
- temporal bridge は `TemporalUpperBodyState`、side、`MinimalAvatarMotionProfile`、solver measurements を入力にし、`target?: SincroArmIkTarget` と reason / debug を返す（`sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts:43`、`sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts:58`）。
- bridge は body-local wrist を優先し、無い場合は scalar fallback を使う（`sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts:84`）。
- `VRMCharacterManager.update()` は `sincroPose` を composer dry-run と full normalized pose application へ渡している（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:295`、`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:300`、`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:314`）。
- Phase 6 solver snapshot は現在 `bridge?` と `ik?` だけを持ち、strict parser で受理している（`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:42`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:165`）。本タスクでは optional `source` field を追加し、旧 log は source 欠損でも valid とする。
- 設計文書は現状、腕 IK target が引き続き `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` を正本にすると記している（`documents/design/frontend/character/motion.md:496`）。本タスクでこの正本を temporal primary / pose fallback へ更新する。

## テスト

- `cd sincromisor-frontend && npm run test -- temporalArmSolverBridge sincroPoseRetargeter sincroPoseArmIkSolve`
- `cd sincromisor-frontend && npm run test -- sincroVrmPoseComposerDryRun motionComposerComparisonMetrics motionMetrics`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- P0 replay fixture comparison を実行し、metrics summary を `impl.md` または `artifacts/` に保存する。
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な motion pipeline の主入力が `SincroPoseMotionSnapshot` arm target から `TemporalUpperBodyState` primary へ変わるため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に primary / fallback 境界、Hand wrist 非採用、debug snapshot、metrics comparison を同期する。公開 WebRTC / backend 契約は変更しない。
