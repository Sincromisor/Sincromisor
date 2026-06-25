# character animation 3.0 phase 6 solver debug metrics docs

## 背景 / 目的

Phase 6 の完了ゲートは、`MinimalAvatarMotionProfile`、temporal-to-solver bridge、pole / constraint、`VrmPoseComposer` が実装されるだけでは足りない。肘反転、腕の伸び切り、肩崩れ、手首 roll 暴れが replay / metrics で比較でき、同一 frame の final pose 書き手が `VrmPoseComposer` に集約されていることを developer が確認できる必要がある。

このタスクでは Phase 6 の solver / composer snapshot を motion-debug recording / viewer / metrics / design docs へ接続し、Phase 6 ゲートを閉じる。

## 完了条件（受け入れ条件）

- [ ] motion debug log の `frame.solver` に Phase 6 solver snapshot を追加する。既存 `frame.solver.poseRetarget` / `frame.solver.poseRetargetRuntime` は削除 / rename せず、`frame.solver.phase6` に新規保存する。保存 schema は設計判断の最小 schema に固定し、plain object / array / finite number / lower-case enum に限定する。
- [ ] motion debug log の `frame.finalPose` に `VrmPoseComposerResult` の `finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を保存できるようにする。旧 log で `frame.finalPose` が無い場合は parse failure ではなく `not_recorded` として viewer に表示する。
- [ ] `motionDebugViewerModel` の layer selector で `solver` と `finalPose` が `available` / `not_recorded` / `invalid` を区別して表示される。
- [ ] `MotionDebugRecordingController.recordPoseFrame()` または相当箇所は、live camera / replay pose-snapshot の同じ mediaTimeMs に対して solver / finalPose snapshot を記録する。mediaTime が揃わない場合は recording failure にせず warning にする。
- [ ] motion metrics に Phase 6 用 key を追加する。最小 key は `solverElbowFlipRejectCount`、`solverReachClampOccupancy`、`solverPoleUncertainFrameCount`、`finalPoseAngularVelocityClampCount`、`finalPoseOwnedBoneConflictCount` とし、計算仕様は設計判断の metrics table に固定する。
- [ ] `finalPoseOwnedBoneConflictCount` は composer result の `warnings` に `owned_bone_conflict:` prefix がある場合だけ count し、正常系では `0` になる。
- [ ] Phase 1 の既存 metrics baseline schema に新 key を追加する場合は fixture / parser / docs を同時に更新し、旧 baseline は unknown key ではなく missing key として扱えるようにする。
- [ ] Debug Console または motion-debug の JSON snapshot から `solver.phase6.profile.schemaVersion === "sincro.minimal-avatar-motion-profile.v1"`、`solver.phase6.arms.left.ik.poleState`、`finalPose.ownedBones` が確認できる。
- [ ] `documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md` に Phase 6 完了時点の責務境界を同期する。必要なら `documents/design/frontend/character/vrm.md` または既存構成に合わせた VRM pose 適用節を追加する。
- [ ] `documents/research/character_animation/roadmap.md` は research roadmap として直接更新しない。実装で確定した現在仕様は `documents/design/frontend/character/` に反映する。
- [ ] Playwright または手動確認で `motion-debug` を開き、solver / finalPose layer が空白にならず、旧 log では `not_recorded`、新 live snapshot では `available` と表示されることを確認する。実カメラ確認ができない場合は fixture replay で代替し、未実行理由を `impl.md` に残す。

## 設計判断（着手前に確定済み）

- `frame.solver` と `frame.finalPose` は既存 log schema の optional slot として使う。既存 frame root に別名 field を増やす案は、Phase 1 で予約された層名と viewer layer selector に反するため採用しない。
- `solver` は入力 / 中間 / IK solve の説明値、`finalPose` は composer 後の VRM normalized local pose と owned bone の説明値に分ける。IK solve result を `finalPose` に混ぜない。
- `frame.solver.phase6` の最小 schema は次に固定する。`left` / `right` は anatomical side であり、viewer mirror とは無関係にする。

```ts
export type MotionDebugPhase6SolverSnapshot = {
    schemaVersion: "sincro.phase6-solver.v1";
    profile: {
        schemaVersion: "sincro.minimal-avatar-motion-profile.v1";
        optionalBones: Record<string, boolean>;
        measurements: Record<string, number | undefined>;
        solverDefaults: Record<string, number>;
        warnings: string[];
    };
    arms: {
        left: MotionDebugPhase6ArmSolverSnapshot;
        right: MotionDebugPhase6ArmSolverSnapshot;
    };
    warnings: string[];
};

export type MotionDebugPhase6ArmSolverSnapshot = {
    bridge?: TemporalArmIkBridgeResult;
    ik?: {
        active: boolean;
        targetClamped: boolean;
        weight: number;
        poleState?: ArmPoleState;
        constraintReasonCodes: string[];
        fallbackReason?: string;
    };
};
```

- `frame.finalPose` の最小 schema は `VrmPoseComposerResult` そのものとし、`schemaVersion: "sincro.vrm-pose-composer-result.v1"` を top-level に追加する。`ownedBones`、`suppressedLayers`、`clampedBones` は `vrm pose composer` タスクの item schema と ordering に従う。
- metrics key は Phase 6 用に追加する。Phase 3 の performance task では metrics key 追加を避けたが、本タスクは Phase 6 ゲートの比較が目的なので追加を必須にする。
- Phase 6 metrics の計算仕様は次に固定する。

| key                                  | unit / 集計                                                                                | missing / invalid | threshold 初期値                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------ |
| `solverElbowFlipRejectCount`         | 左右腕それぞれの `constraintReasonCodes` に `pole_flip_rejected` がある arm-frame 数の合計 | `not_available`   | pass `<= 1`, warn `<= 3`, fail `> 3`       |
| `solverReachClampOccupancy`          | `ik.targetClamped === true` の arm-frame 数 / valid arm-frame 数。`0..1` ratio             | `not_available`   | pass `<= 0.2`, warn `<= 0.4`, fail `> 0.4` |
| `solverPoleUncertainFrameCount`      | `poleState === "uncertain"` の arm-frame 数の合計                                          | `not_available`   | pass `<= 2`, warn `<= 5`, fail `> 5`       |
| `finalPoseAngularVelocityClampCount` | `frame.finalPose.clampedBones[].reason === "angular_velocity"` の bone-frame 数の合計      | `not_available`   | pass `0`, warn `<= 2`, fail `> 2`          |
| `finalPoseOwnedBoneConflictCount`    | `frame.finalPose.warnings` の `owned_bone_conflict:` 件数の合計                            | `not_available`   | pass `0`, warn `0`, fail `> 0`             |

- 各 metric の `sampleCount` は valid frame 数ではなく、上記 denominator に使った arm-frame または bone-frame 数を入れる。`solverReachClampOccupancy` の `value` は ratio、他は count とする。
- `invalid` 表示は parser が未知 schemaVersion、非 finite number、unknown enum、plain object 以外の runtime object を検出した場合に使う。slot 欠落は `not_recorded`、schema はあるが対象 arm / pose が無い場合は `not_available` にする。
- 旧 log 互換は parse success + `not_recorded` 表示とする。旧 log を live recompute で隠す案は replay の再現性を損なうため採用しない。
- `roadmap.md` は research source のまま保持し、現在仕様の正本は design docs に置く。
- 外部境界は browser UI / local recording download のみである。ネットワーク / backend / WebRTC payload は変更しない。

## スコープ境界

- 本タスクでやること:
    - solver / finalPose snapshot の recording schema と viewer 表示。
    - Phase 6 metrics key と parser / baseline 対応。
    - Debug Console / motion-debug の観測性。
    - Phase 6 design docs 同期。
- 本タスクでやらないこと:
    - profile / bridge / pole / composer の新規アルゴリズム実装。
    - MotionIntent、semantic clip、finger 制御。
    - Hand / Face ROI。
    - performance degradation policy の追加。
- 依存タスクとの境界:
    - `task-260625231726-character-animation-3-phase-6-vrm-pose-composer` が `VrmPoseComposerResult` と finalPose item schema を提供する。
    - `task-260625231726-character-animation-3-phase-6-arm-pole-constraints` が `ArmPoleState` と constraint reasonCodes を提供する。
    - `task-260625231726-character-animation-3-phase-6-temporal-arm-solver-bridge` が `TemporalArmIkBridgeResult` を提供する。
    - `task-260625231715-character-animation-3-phase-6-minimal-avatar-motion-profile` が `MinimalAvatarMotionProfile` を提供する。
    - 本タスクはそれらを記録・表示・計測するだけで、solver の数式を変えない。

## 実装方針（既存コード整合: file:line）

- motion debug schema はすでに `finalPose` optional slot を持つ（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:114`）。本タスクではこの slot の parse / viewer 表示を具体化する。
- `documents/design/frontend/character/motion.md` は motion-debug layer selector に `solver`、`finalPose`、`applied` を含めている（`documents/design/frontend/character/motion.md:63`）。本タスクは未実装 / 未記録だった層を実データへ接続する。
- `documents/design/frontend/character/motion.md` は `final-pose-playback` replay で `frame.finalPose` 欠落時に `missing_final_pose` を返す予約を持つ（`documents/design/frontend/character/motion.md:75`）。本タスクでは viewer 表示を `not_recorded` とし、playback mode の欠落 reason は `missing_final_pose` のまま維持する。
- `MotionDebugRecordingController.recordPoseFrame()` は recording frame に metrics / tracker などを保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:132`, `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:134`）。ここに solver / finalPose snapshot を追加する。
- `motionMetrics.ts` は retarget / temporal を parse して elbow flip や reach clamp などを計測している（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:461`, `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:493`, `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:752`）。Phase 6 metrics は solver / finalPose slot を優先し、無い場合は `not_available` にする。
- Phase 5 temporal metrics は `frame.temporal` の valid state だけを読む設計である（`documents/design/frontend/character/motion.md:195`）。Phase 6 metrics も同様に saved solver / finalPose を正本にし、旧 log を live recompute しない。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugLogSchema`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- Playwright または手動で `motion-debug` の solver / finalPose layer を確認する。
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変更しないが、developer-visible な motion debug log、metrics baseline、VRM pose 適用責務が変わるため、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md` を同期し、VRM pose 適用節が不足する場合は `documents/design/frontend/character/` 配下の既存構成に合わせて追加する。
