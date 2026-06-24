# character animation 3.0 phase 4 ReliabilityMap contract

## 背景 / 目的

character-animation-3.0 の Phase 4 は、MediaPipe confidence をそのまま IK / filter / fallback 判断に使わず、制御用の信頼度を部位別に再定義する段階である。

このタスクでは、後続の pose reliability estimator、debug / replay、TemporalStateEstimator が同じ名前・単位を読めるように、`ReliabilityMap` の v1 contract、parse API、初期 neutral factory を先に固定する。実際の pose からの詳細計算や downstream weight 反映は後続タスクへ分ける。

参照正本:

- `documents/research/character_animation/roadmap.md` の `Phase 4: ReliabilityMap`
- `documents/research/character_animation/answers/01-mediapipe-tracking.md` の「3. MediaPipe 出力ごとの信頼度設計」
- `documents/design/frontend/character/tracking.md`
- `documents/design/frontend/character/motion.md`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/reliability/reliabilityMap.ts` を追加し、`RELIABILITY_MAP_SCHEMA_VERSION = "sincro.reliability-map.v1"`、`ReliabilityMap`、`ReliabilityPartState`、`ReliabilityReasonCode`、`ReliabilityWarningCode`、`JointReliability`、`PartReliability`、`GestureReliability`、`ReliabilityMapParseResult`、`parseReliabilityMap()`、`createDefaultReliabilityMap()` を export する。
- [ ] v1 schema は JSON 保存可能な plain object に限定し、`THREE.Vector3`、`THREE.Quaternion`、class instance、function、`NaN` / `Infinity` を reject する。未知 `schemaVersion` は `unknown_schema_version`、値域違反は `out_of_range`、構造違反は `invalid_state` として返す。
- [ ] `ReliabilityPartState` は `"tracked" | "suspect" | "predicted" | "lost" | "recovering"` に固定する。Phase 5 の TemporalStateEstimator とは大文字表記を共有せず、log / JSON 境界は lower-case enum に統一する。
- [ ] `JointReliability.finalWeight` と各 component score は `0..1` の finite number に固定する。`finalWeight < threshold` でも parse は成功し、低 weight 観測として保持できる。
- [ ] `ReliabilityMap` の保存 schema は本タスクの「設計判断」にある TypeScript shape に固定する。`timestamp`、`camera`、`joints`、`parts`、`gesture`、`warnings`、parse error shape を実装時に変更しない。
- [ ] `createDefaultReliabilityMap(mediaTimeMs)` は `timestamp.mediaTimeMs = mediaTimeMs`、`camera.videoWidth = 0`、`camera.videoHeight = 0`、`camera.cameraQualityScore = 0`、`camera.cameraQualityStatus = "unknown"`、全 joint / part を `state: "lost"`、`finalWeight: 0`、各 component `score: 0`、`reasonCodes: ["no_observation"]`、`warnings: ["no_observation"]` で返し、`gesture` も `state: "lost"`、`finalWeight: 0`、`confidence: 0`、`stableDurationMs: 0` とする。
- [ ] `parseReliabilityMap()` のユニットテストを追加し、valid object、未知 schema、非 finite number、`finalWeight` 範囲外、未知 enum、extra key、reason / warning code の未知値が期待どおり reject されることを確認する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に、ReliabilityMap v1 の schemaVersion、保存 slot、低 weight 観測を破棄しない方針を同期する。

## 設計判断（着手前に確定済み）

- 新規モジュールの所在は `src/character/reliability/` とする。`features/gaze/poseTracking` は MediaPipe / tracker 観測の所有境界、`character/canonical` は body-local 意味量 contract の所有境界であり、reliability は両者の間に置く中間層として独立させる。
- `ReliabilityMap` は runtime object ではなく replay log にそのまま保存できる JSON contract とする。`CanonicalUpperBodyState` も tuple / number / enum で保存する方針で定義済みであり（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:35`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:94`）、同じ境界設計に合わせる。
- state enum は lower-case JSON 値に固定する。roadmap 本文では `Tracked` / `Suspect` など大文字表記だが、保存形式では `CanonicalSource` と同じ小文字 enum の方が既存 TypeScript / zod schema と揃う（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:5`）。
- v1 の完全な保存 schema は次に固定する。不足値を optional にすると後続 debug の解釈が揺れるため、未計算 component は `score: 0`、対応する `reasonCodes`、`warnings` で表す。

```ts
type ReliabilityPartState = "tracked" | "suspect" | "predicted" | "lost" | "recovering";

type ReliabilitySource =
    | "pose"
    | "hand"
    | "face"
    | "gesture"
    | "camera"
    | "previous"
    | "neutral"
    | "mixed";

type ReliabilityReasonCode =
    | "no_observation"
    | "not_available_in_pose_snapshot"
    | "pose_not_detected"
    | "fallback_snapshot"
    | "model_presence_low"
    | "model_visibility_low"
    | "tracking_lost"
    | "weak_tracking"
    | "bad_border"
    | "missing_world_coordinates"
    | "bone_length_inconsistent"
    | "body_scale_missing"
    | "body_scale_jump"
    | "temporal_jump"
    | "invalid_dt"
    | "side_inconsistent"
    | "roi_missing"
    | "roi_inconsistent"
    | "camera_quality_missing"
    | "camera_quality_bad";

type ReliabilityWarningCode =
    | "no_observation"
    | "not_available_in_pose_snapshot"
    | "low_confidence"
    | "tracking_lost"
    | "near_border"
    | "out_of_frame"
    | "missing_world_coordinates"
    | "bone_length_inconsistent"
    | "body_scale_jump"
    | "temporal_jump"
    | "side_inconsistent"
    | "roi_inconsistent"
    | "camera_quality_low";

type ReliabilityScoreComponent = {
    score: number; // 0..1
    reasonCodes: ReliabilityReasonCode[];
};

type ReliabilityComponentSet = {
    modelPresence: ReliabilityScoreComponent;
    modelVisibility: ReliabilityScoreComponent;
    tracking: ReliabilityScoreComponent;
    border: ReliabilityScoreComponent;
    boneLength: ReliabilityScoreComponent;
    bodyScale: ReliabilityScoreComponent;
    temporal: ReliabilityScoreComponent;
    side: ReliabilityScoreComponent;
    roi: ReliabilityScoreComponent;
    cameraQuality: ReliabilityScoreComponent;
};

type ReliabilityJointName =
    | "leftShoulder"
    | "rightShoulder"
    | "leftElbow"
    | "rightElbow"
    | "leftWrist"
    | "rightWrist"
    | "head"
    | "leftHand"
    | "rightHand";

type ReliabilityPartName =
    | "torso"
    | "head"
    | "leftArm"
    | "rightArm"
    | "leftHand"
    | "rightHand"
    | "leftFinger"
    | "rightFinger";

type JointReliability = {
    state: ReliabilityPartState;
    finalWeight: number;
    source: ReliabilitySource;
    components: ReliabilityComponentSet;
    warnings: ReliabilityWarningCode[];
};

type PartReliability = {
    state: ReliabilityPartState;
    finalWeight: number;
    source: ReliabilitySource;
    joints: ReliabilityJointName[];
    components: ReliabilityComponentSet;
    warnings: ReliabilityWarningCode[];
};

type GestureReliability = {
    state: ReliabilityPartState;
    finalWeight: number;
    source: "gesture" | "hand" | "previous" | "neutral" | "mixed";
    label?: string;
    confidence: number; // 0..1
    stableDurationMs: number;
    components: Pick<
        ReliabilityComponentSet,
        "tracking" | "temporal" | "side" | "roi" | "cameraQuality"
    >;
    warnings: ReliabilityWarningCode[];
};

type ReliabilityCameraSummary = {
    videoWidth: number;
    videoHeight: number;
    cameraQualityScore: number; // 0..1
    cameraQualityStatus: "good" | "warn" | "bad" | "unknown";
    reasonCodes: ReliabilityReasonCode[];
};

type ReliabilityMap = {
    schemaVersion: typeof RELIABILITY_MAP_SCHEMA_VERSION;
    timestamp: {
        mediaTimeMs: number;
        poseLastUpdatedAtMs?: number;
    };
    camera: ReliabilityCameraSummary;
    joints: Record<ReliabilityJointName, JointReliability>;
    parts: Record<ReliabilityPartName, PartReliability>;
    gesture: GestureReliability;
    warnings: ReliabilityWarningCode[];
};
```

`Record<...>` は実装上、zod `.object({ leftShoulder: ..., ... }).strict()` に展開し、未知 joint / part key を許可しない。

- parse API は次の discriminated union に固定する。unknown schema version は zod の詳細 validation より先に判定し、`path: ["schemaVersion"]` を返す。

```ts
type ReliabilityMapParseErrorCode =
    | "unknown_schema_version"
    | "invalid_state"
    | "out_of_range";

type ReliabilityMapParseError = {
    code: ReliabilityMapParseErrorCode;
    path: string[];
    message: string;
};

type ReliabilityMapParseResult =
    | { ok: true; map: ReliabilityMap }
    | { ok: false; errors: ReliabilityMapParseError[] };
```

- `segmentation` は roadmap 上は任意品質指標であり、Phase 4 v1 contract には入れない。常時ログ保存しない方針と矛盾させないため、将来必要になったら `schemaVersion` を上げる。
- 外部 API / network / backend 契約は変更しない。入力検証は zod schema に閉じ、parse failure は例外ではなく discriminated union で返す。

## スコープ境界

- 本タスクでやること:
    - ReliabilityMap v1 の TypeScript 型、zod schema、parse API、default factory。
    - contract の設計文書同期。
    - schema / parse のユニットテスト。
- 本タスクでやらないこと:
    - `SincroPoseMotionSnapshot` から実際の reliability を計算する estimator。
    - `motion-debug` の live snapshot / recording / viewer への接続。
    - canonical confidence、IK weight、retarget config への反映。
    - Hand / Face / Gesture raw result の導入。

## 実装方針（既存コード整合: file:line）

- `CanonicalUpperBodyState` は `schemaVersion`、plain object 型、zod schema、parse result、unknown schema version の優先判定を同じファイルで定義している（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:3`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:114`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:233`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:276`）。ReliabilityMap もこの構成を踏襲する。
- motion-debug log v1 は `frame.reliability` slot を optional `unknown` として既に予約している（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:109`）。本タスクでは schema slot 名を変えず、`ReliabilityMap` parser は viewer / replay 境界で使う。
- motion-debug viewer の layer key には `"reliability"` が既に含まれている（`sincromisor-frontend/src/pages/motionDebug/types.ts:56`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:24`）。本タスクでは UI 接続は行わず、後続 debug task で `parseReliabilityMap()` を使う。
- CameraQualityScore は `schemaVersion`、`overall.score`、component score、reason code を持つ既存 pure score である（`sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScoreTypes.ts:4`、`sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScoreTypes.ts:36`）。ReliabilityMap はこれを直接埋め込まず、`cameraQuality` component と `camera` summary に `0..1` score と reason code だけを写す。

## テスト

- `cd sincromisor-frontend && npm run test -- reliabilityMap`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

`reliabilityMap` のテストでは、`createDefaultReliabilityMap(123)` の snapshot、全 component の finite / range validation、strict object の extra key reject を確認する。

## ドキュメント同期の要否

要。developer 向け debug / replay log の保存 contract と motion pipeline の内部 contract が増えるため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に ReliabilityMap v1、`frame.reliability`、低 weight 観測を破棄しない方針を同期する。公開 WebRTC / backend 契約は変更しない。
