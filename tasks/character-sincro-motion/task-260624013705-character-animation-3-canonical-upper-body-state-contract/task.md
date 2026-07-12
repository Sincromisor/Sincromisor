# character animation 3.0 canonical upper body state contract

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の `Phase 2: CanonicalUpperBodyState contract` は、IK / Temporal / MotionIntent / AvatarMotionProfile / metrics が共有する体幹基準の意味量 contract を先に固定することを要求している。Phase 1 で `motion-debug` log の `frame.canonical` slot と layered viewer は用意済みだが、中身は `unknown` の予約枠であり、後段が読む名前・単位・保存形式はまだ決まっていない。

このタスクでは、計算ロジックには踏み込まず、JSON 保存可能な `CanonicalUpperBodyState` の TypeScript 型、Zod schema、parse API、最小 contract 文書を固定する。VRM bone rotation や Three.js runtime object を canonical state に入れない境界をここで明文化する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts` を追加し、`CanonicalUpperBodyState`、`CanonicalTorsoFrame`、`CanonicalArmState`、`CanonicalPartMeta`、`CanonicalCalibrationSnapshot`、`parseCanonicalUpperBodyState()` を export する。
- [ ] schema version は文字列 literal `"sincro.canonical-upper-body.v1"` に固定する。`CanonicalUpperBodyState.schemaVersion` がこの値以外の入力は `parseCanonicalUpperBodyState()` で `unknown_schema_version` error になる。
- [ ] canonical の左右は `left` / `right` の解剖学的 side とし、画面 mirror や camera preview の左右を表す field は追加しない。
- [ ] 保存形式は `number`、`string enum`、`readonly [number, number, number]`、plain object のみで構成し、`THREE.Vector3`、`THREE.Quaternion`、`VRMHumanBoneName` keyed pose、MediaPipe landmark object を型にも schema にも含めない。
- [ ] `CanonicalArmState` は最低限 `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification`、`confidence`、`source`、`warnings`、`outOfRangeFields` を持つ。値域は本タスクの「設計判断」の最小 schema に固定し、parse 時に範囲外を reject する。
- [ ] `CanonicalTorsoFrame` は `coordinateSystem: "body_local"`、`shoulderCenter`、任意の `hipCenter`、`bodyRight`、`bodyUp`、`bodyFront`、`shoulderWidth`、`torsoScale`、`yawRad`、`confidence`、`source`、`warnings` を持つ。各 vector は finite な 3 要素 tuple のみを許可する。
- [ ] `CanonicalCalibrationSnapshot` は `id` だけでなく、replay 再現に必要な `neutralYawRad`、`shoulderWidth`、`torsoScale`、左右の `handBaseline` を持つ。calibration 未実装時も `source: "default"` の deterministic snapshot を保存できる。
- [ ] `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` を export し、値は本タスクの「設計判断」にある default calibration 値に固定する。default calibration を関数内の inline object として重複定義しない。
- [ ] `parseCanonicalUpperBodyState(value)` の戻り値は本タスクの「設計判断」にある `CanonicalUpperBodyStateParseResult` に固定する。成功時は `{ ok: true, state }`、失敗時は `{ ok: false, errors }` を返し、parse failure で例外を throw しない。
- [ ] `parseCanonicalUpperBodyState(value)` は valid canonical、未知 schema version、範囲外 scalar、非 finite number、runtime object 風の extra key 混入を Vitest で検証する。error code は最低限 `unknown_schema_version`、`invalid_state`、`out_of_range` を含める。
- [ ] `documents/design/frontend/character/motion.md` に `CanonicalUpperBodyState` の責務、保存単位、VRM bone rotation を含めない方針を同期する。
- [ ] `documents/design/frontend/character/tracking.md` に `SincroPoseMotionSnapshot` は観測 snapshot、`CanonicalUpperBodyState` は後段共有の body-local 意味量 contract であり、両者を混同しない方針を同期する。

## 設計判断（着手前に確定済み）

- 新規 canonical contract は `src/character/canonical/` に置く。`features/gaze/poseTracking` は MediaPipe 由来の観測 snapshot、`character/retargeting` は VRM 向け retarget、`character/motionEvaluation` は log / replay / metrics なので、後段共有の body-local contract は独立した `character/canonical` を責務境界にする。
- validation は既存の `zod` を使う。`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:1` が motion debug log schema で `zod` を使っており、同じ境界 validation 方針に揃える。
- `CanonicalUpperBodyState` は `frame.canonical` にそのまま保存できる plain JSON shape にする。class instance や Three.js object を内部で便利に使う案は、replay / debug log の決定性を壊すため採用しない。
- `ImageSpace2D`、`MediaPipeWorldSpace`、`CameraObservationSpace`、`BodyLocalSpace`、`AvatarControlSpace`、`VRMNormalizedLocalPose` は field の `coordinateSystem` / ドキュメント上の用語として分ける。このタスクの保存対象は `BodyLocalSpace` の canonical state だけであり、`AvatarControlSpace` と `VRMNormalizedLocalPose` は後続タスクの責務に残す。

最小 schema:

```ts
type CanonicalTuple3 = readonly [number, number, number];

type CanonicalSource =
    | "pose"
    | "hand"
    | "face"
    | "previous"
    | "predicted"
    | "neutral"
    | "mixed";

type CanonicalWarningCode =
    | "torso_frame_unreliable"
    | "front_flip_rejected"
    | "left_right_swap_suspect"
    | "dropout"
    | "recovery_blend"
    | "out_of_range"
    | "low_confidence"
    | "missing_world_coordinates"
    | "calibration_missing";

type CanonicalOutOfRangeField = {
    path: string;
    value: number;
    min?: number;
    max?: number;
    clampedValue: number;
};

type CanonicalPartMeta = {
    confidence: number; // 0..1
    source: CanonicalSource;
    warnings: CanonicalWarningCode[];
    outOfRangeFields: CanonicalOutOfRangeField[];
};

type CanonicalCalibrationSnapshot = {
    id: string;
    source: "default" | "initial" | "online" | "replay";
    neutralYawRad: number;
    shoulderWidth: number;
    torsoScale: number;
    handBaseline: {
        left: { palmSize: number; openSpread: number };
        right: { palmSize: number; openSpread: number };
    };
    capturedAtMediaTimeMs?: number;
};

type CanonicalTorsoFrame = CanonicalPartMeta & {
    coordinateSystem: "body_local";
    shoulderCenter: CanonicalTuple3;
    hipCenter?: CanonicalTuple3;
    bodyRight: CanonicalTuple3;
    bodyUp: CanonicalTuple3;
    bodyFront: CanonicalTuple3;
    shoulderWidth: number;
    torsoScale: number;
    yawRad: number;
};

type CanonicalArmClassification =
    | "side"
    | "front"
    | "diagonal"
    | "crossed"
    | "unknown";

type CanonicalArmState = CanonicalPartMeta & {
    reach: number; // 0..1.15
    elevationRad: number; // -Math.PI / 2 .. Math.PI / 2
    openness: number; // -1..1, positive means away from torso
    forwardness: number; // 0..1
    elbowFlexionRad: number; // 0..Math.PI
    classification: CanonicalArmClassification;
    bodyLocalWrist?: CanonicalTuple3;
    bodyLocalElbow?: CanonicalTuple3;
};

type CanonicalUpperBodyState = {
    schemaVersion: "sincro.canonical-upper-body.v1";
    timestamp: {
        mediaTimeMs: number;
        poseLastUpdatedAtMs?: number;
    };
    torso: CanonicalTorsoFrame;
    head?: CanonicalPartMeta & {
        yawRad: number;
        pitchRad: number;
        rollRad: number;
    };
    arms: {
        left: CanonicalArmState;
        right: CanonicalArmState;
    };
    calibration: CanonicalCalibrationSnapshot;
    warnings: CanonicalWarningCode[];
};
```

`reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad` は parse 時に上記値域を超える入力を reject する。計算側が clamp した場合は `outOfRangeFields` へ元値と clamp 後の値を記録する。parse API は記録済み log の検証用であり、範囲外値を黙って補正しない。

parse result shape:

```ts
type CanonicalUpperBodyStateParseErrorCode =
    | "unknown_schema_version"
    | "invalid_state"
    | "out_of_range";

type CanonicalUpperBodyStateParseError = {
    code: CanonicalUpperBodyStateParseErrorCode;
    path: string[];
    message: string;
};

type CanonicalUpperBodyStateParseResult =
    | { ok: true; state: CanonicalUpperBodyState }
    | { ok: false; errors: CanonicalUpperBodyStateParseError[] };
```

Zod issue の path は `string[]` へ写す。配列 index は decimal string に変換し、root error は `[]` とする。`schemaVersion` が文字列で、かつ `"sincro.canonical-upper-body.v1"` ではない場合は `unknown_schema_version` を優先する。値域違反は `out_of_range`、非 finite number / extra key / shape 不一致は `invalid_state` とする。

default calibration:

```ts
const DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT: CanonicalCalibrationSnapshot = {
    id: "default-canonical-calibration-v1",
    source: "default",
    neutralYawRad: 0,
    shoulderWidth: 1,
    torsoScale: 1,
    handBaseline: {
        left: { palmSize: 1, openSpread: 1 },
        right: { palmSize: 1, openSpread: 1 },
    },
};
```

`capturedAtMediaTimeMs` は default calibration では未設定にする。後続 estimator は calibration が未指定のとき必ずこの exported constant を参照する。

## スコープ境界

- 本タスクでやること:
    - canonical state の型、Zod schema、parse API。
    - default calibration snapshot の定数。
    - 値域、source、warning、classification の語彙固定。
    - 設計文書への contract 同期。
- 本タスクでやらないこと:
    - Pose snapshot から canonical state を計算する処理。
    - torso frame 推定、bodyFront 反転抑制、arm feature 抽出。
    - `motion-debug` recording / replay への `frame.canonical` 書き込み。
    - IK、Temporal、MotionIntent、AvatarMotionProfile の実装変更。

## 実装方針（既存コード整合: file:line）

- Phase 1 log schema は `frame.canonical` を optional `unknown` slot として予約している（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:103`）。本タスクは log schema の top-level field 名を変えず、その slot に入れる payload の正本型を追加する。
- layered viewer は canonical layer を既に持つが、Phase 1 では未実装 layer として扱っている（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:54`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:115`）。本タスクでは viewer の挙動は変えず、後続 integration タスクで canonical 値を流す。
- `SincroPoseMotionSnapshot` は tracking 観測の既存 snapshot であり、`upperBody`、左右腕 target、lower body target、inference timing を含む（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:79`）。canonical contract はこの型を置き換えず、後段共有の body-local 意味量として追加する。
- `SincroPoseRetargetFrame` は VRM 向け additive rotation と IK solver snapshot を持つ（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:24`）。canonical state にはこの VRM 向け rotation を入れない。
- 設計文書は Phase 1 の debug log / metrics まで同期済みである（`documents/design/frontend/character/motion.md:107`、`documents/design/frontend/character/tracking.md:91`）。本タスクでは同じ Data / State 節へ canonical contract を追加する。

## テスト

- `cd sincromisor-frontend && npm run test -- canonicalUpperBodyState`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`
- 可能なら最終確認で `npm run gate` を実行する。時間や環境制約で省く場合は `impl.md` に理由を残す。

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer 向け motion debug log と後続 character motion pipeline の内部公開 contract を追加するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に `CanonicalUpperBodyState` の責務、保存単位、VRM bone rotation を含めない方針を同期する。
