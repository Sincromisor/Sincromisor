# character animation 3.0 phase 6 temporal arm solver bridge

## 背景 / 目的

Phase 5 までで `TemporalUpperBodyState` は canonical arm scalar、body-local wrist / elbow、dropout / recovering state を持つようになった。一方、現行本番 retarget は `SincroPoseMotionSnapshot` から直接 `SincroPoseRetargetFrame` を作り、`solveWorldArmIk()` は Pose snapshot の world target と `armIkTargetScale` を使っている。

Phase 6 の目的は、生 landmark や pose snapshot の再解釈ではなく、temporal / canonical の意味量から avatar shoulder-local IK target を作ることにある。このタスクでは既存本番経路を壊さず、Temporal arm state と `MinimalAvatarMotionProfile` から solver 入力を作る bridge を追加する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts` を追加し、`createTemporalArmIkInput(input)` を export する。
- [ ] 入力型は `TemporalUpperBodyState`、side、`MinimalAvatarMotionProfile`、既存 `SincroArmIkSolver` の arm length / shoulder width 相当値を受け取る。
- [ ] 出力型は `{ target?: SincroArmIkTarget; reasonCodes: string[]; scale: TemporalArmIkScaleSnapshot; sourceState: TemporalPartState; debug: TemporalArmIkDebugSnapshot }` に固定する。通常時は `target` に `wrist`、`elbowPole`、`weight` を入れ、lost / invalid 時は `target: undefined`、`reasonCodes` と `debug` は必ず返す。
- [ ] `bodyLocalWrist` がある場合はそれを主入力にし、body-local absolute tuple から avatar shoulder-local target へ下記の式で変換する。無い場合は `reach`、`elevationRad`、`openness`、`forwardness` から deterministic に shoulder-local wrist target を復元する。
- [ ] depth は `forwardness * profile.solverDefaults.depthCompression` として扱い、Pose wrist / Hand wrist の raw world z を再読解しない。
- [ ] lateral / vertical は `profile.solverDefaults.lateralScale`、`verticalScale`、`defaultReachScale` を掛け、腕長合計を超える場合は solver 前 target として `maxReachRatio 0.985` 相当まで clamp する。
- [ ] `weight` は temporal arm `confidence` と `state` から決める。`tracked` は `confidence`、`suspect` は `confidence * 0.55`、`recovering` は `confidence * recoveringBlend.progress`、`predicted` は `confidence * 0.35`、`lost` は `0` に固定する。
- [ ] `lost` または finite でない input の場合は `target: undefined` を返し、`reasonCodes` に `temporal_arm_lost` または `invalid_temporal_arm` を入れる。この場合 `debug.weightBeforeStateScale`、`debug.weightAfterStateScale` は `0` にする。
- [ ] 既存 `solveWorldArmIk()` の入力経路は削除しない。bridge は新しい helper と test までに留め、実際の本番切替は composer / debug 接続タスクへ残す。
- [ ] `sincromisor-frontend/src/character/motionSolver/__tests__/temporalArmSolverBridge.test.ts` を追加し、bodyLocalWrist あり、scalar fallback、lost、recovering、profile scale / depthCompression、finite validation を検証する。
- [ ] `documents/design/frontend/character/motion.md` に、Phase 6 bridge は Pose wrist ではなく `TemporalUpperBodyState` を優先し、Hand wrist を IK target 主入力にしないことを同期する。

## 設計判断（着手前に確定済み）

- 新規 module は `src/character/motionSolver/` に置く。既存 `retargeting/` へ入れる案は、Phase 6 以降の solver が canonical / temporal / profile を読む層であり、MediaPipe snapshot retarget とは責務が違うため採用しない。
- `SincroArmIkTarget` の既存 shape（`wrist: Vector3`, `elbowPole: Vector3`, `weight: number`）は solver 互換のため維持する。ただし debug snapshot は Vector3 ではなく tuple / number へ serialize する前提にする。
- bridge result の最小 schema は次に固定する。

```ts
export type TemporalArmIkBridgeResult = {
    target?: SincroArmIkTarget;
    reasonCodes: string[];
    scale: {
        shoulderWidth: number;
        upperArmLength: number;
        lowerArmLength: number;
        armLength: number;
        defaultReachScale: number;
        lateralScale: number;
        verticalScale: number;
        depthCompression: number;
        maxReachRatio: 0.985;
    };
    sourceState: TemporalPartState;
    debug: {
        usedBodyLocalWrist: boolean;
        usedBodyLocalElbow: boolean;
        shoulderLocal: readonly [number, number, number];
        wristBeforeClamp?: readonly [number, number, number];
        wristAfterClamp?: readonly [number, number, number];
        elbowPoleBeforeNormalize?: readonly [number, number, number];
        weightBeforeStateScale: number;
        weightAfterStateScale: number;
    };
};
```

- `MinimalAvatarMotionProfile` は依存タスク `task-260625231715-character-animation-3-phase-6-minimal-avatar-motion-profile` が `sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts` に追加する `solverDefaults` を読む。
- body-local absolute tuple から shoulder-local target への変換式は次に固定する。
    - `sideSign = left ? -1 : 1`
    - `profileShoulderWidth = profile.measurements.shoulderWidth ?? solver.shoulderWidth`
    - `shoulderLocal = [sideSign * profileShoulderWidth * 0.5, 0, 0]`
    - `relative = bodyLocalWrist - shoulderLocal`
    - `x = relative[0] * profile.solverDefaults.lateralScale * profile.solverDefaults.defaultReachScale`
    - `y = relative[1] * profile.solverDefaults.verticalScale * profile.solverDefaults.defaultReachScale`
    - `z = relative[2] * profile.solverDefaults.depthCompression * profile.solverDefaults.defaultReachScale`
    - `bodyLocalElbow` がある場合の `elbowPole` も同じ `bodyLocalElbow - shoulderLocal` と scale 順で作る。
- body-local tuple が無い場合の scalar fallback の復元式は次に固定する。
    - `rawReach = reach * (upperArmLength + lowerArmLength)`
    - `x = openness * sideSign * rawReach * lateralScale * defaultReachScale`
    - `y = sin(elevationRad) * rawReach * verticalScale * defaultReachScale`
    - `z = forwardness * rawReach * depthCompression * defaultReachScale`
    - 最終 vector length は腕長合計 `* 0.985` 以下に clamp する。
- `elbowPole` は `bodyLocalElbow` があれば `bodyLocalElbow - shoulder` 相当を使い、無ければ `openness` と `elbowFlexionRad` から外向き上方向の fallback pole を作る。pole state の安定化は別タスク `arm pole constraints` の責務。
- `bodyLocalWrist` / `bodyLocalElbow` は body-local tuple であり、VRM bone rotation や final quaternion ではない。ここで `VRMHumanBoneName` pose を生成しない。
- 外部境界はない。入力 validation は finite number と known temporal state のみで行う。

## スコープ境界

- 本タスクでやること:
    - Temporal arm state から IK target 候補を作る pure helper。
    - profile scale / depth compression の適用。
    - temporal state 別 weight policy。
    - helper の単体テストと設計文書同期。
- 本タスクでやらないこと:
    - 本番 retarget の入力を temporal bridge へ全面切替。
    - pole flip reject、angular velocity clamp、wrist roll 分配。
    - `VrmPoseComposer` や final pose 書き込み。
    - Hand / Gesture / finger 制御。
- 依存タスクとの境界:
    - `minimal avatar motion profile` が提供する `solverDefaults` と optional measurement を読む。
    - `arm pole constraints` は本タスクの `elbowPole` 候補をさらに状態化 / stabilizing する。
    - `vrm pose composer` は bridge と solver の結果を final pose 合成へ使う。

## 実装方針（既存コード整合: file:line）

- `TemporalUpperBodyState` は `arms.left/right` に `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`bodyLocalWrist`、`bodyLocalElbow`、`state`、`confidence` を持つ（`sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:68`, `sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:75`, `sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:76`, `sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:100`）。
- canonical arm feature は `shoulderLocal`、`elbowLocal`、`wristLocal` を body-local absolute tuple として計算し、`bodyLocalWrist` と `bodyLocalElbow` を保存している（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:52`, `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:53`, `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:54`, `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:134`, `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:135`）。bridge は shoulder offset を再構成して相対化する。
- 既存 IK target 型は `wrist`、`elbowPole`、`weight` である（`sincromisor-frontend/src/character/ik/sincroArmIkTypes.ts:6`）。bridge は solver 互換のためこの shape を維持する。
- 現行 `solveWorldArmIk()` は Pose snapshot の shoulder / wrist / elbow world target を読み、`solver.shoulderWidth * config.armIkTargetScale` で変換している（`sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts:41`, `sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts:51`, `sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts:56`, `sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts:61`）。本タスクの helper はこの関数を削除せず、後続切替用の新経路として追加する。
- roadmap は Pose wrist を腕 IK target の主入力、Hand は palm / finger / gesture 補助とする方針を示している（`documents/research/character_animation/roadmap.md:411`）。Phase 6 bridge は Hand wrist を読まない。
- Phase 5 design は VRM quaternion / IK pole / final pose smoothing を Phase 6 以降へ残している（`documents/design/frontend/character/motion.md:156`）。本タスクはそのうち target bridge だけを扱う。

## テスト

- `cd sincromisor-frontend && npm run test -- temporalArmSolverBridge`
- `cd sincromisor-frontend && npm run test -- temporalUpperBodyState`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer-visible な motion pipeline の入力優先順位と solver bridge contract が増えるため、`documents/design/frontend/character/motion.md` に `TemporalUpperBodyState` → solver input の式、weight policy、Hand wrist 非採用の判断を同期する。
