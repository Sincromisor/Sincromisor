# character animation 3.0 phase 5 temporal state contract

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の Phase 5 は、平滑化を単一の後処理ではなく `Tracked` / `Suspect` / `Predicted` / `Lost` / `Recovering` を持つ状態推定として扱うことを求めている。Phase 4 では `ReliabilityMap` と canonical confidence への伝播が完了しているため、次は TemporalStateEstimator が保存・replay・debug で共有する contract を先に固定する。

このタスクでは `TemporalUpperBodyState` v1 の TypeScript 型、parse API、default factory だけを追加する。One Euro Filter、prediction、recovering blend、metrics 接続は後続タスクに分け、Phase 5 の土台を小さく固定する。

依存:

- `task-260625035438-character-animation-3-phase-4-downstream-weights`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts` を追加し、`TEMPORAL_UPPER_BODY_SCHEMA_VERSION = "sincro.temporal-upper-body.v1"`、`TemporalPartState`、`TemporalSource`、`TemporalWarningCode`、`TemporalTuple3`、`TemporalPartMeta`、`TemporalArmState`、`TemporalHeadState`、`TemporalUpperBodyState`、`TemporalUpperBodyStateParseResult`、`parseTemporalUpperBodyState()`、`createDefaultTemporalUpperBodyState()` を export する。
- [ ] `TemporalPartState` は JSON 保存値として `"tracked" | "suspect" | "predicted" | "lost" | "recovering"` に固定する。roadmap の大文字表記は文書上の呼称とし、実装・log 境界では lower-case enum に統一する。
- [ ] v1 schema は JSON 保存可能な plain object に限定し、`THREE.Vector3`、`THREE.Quaternion`、class instance、function、`NaN` / `Infinity`、unknown enum、extra key を reject する。未知 `schemaVersion` は `unknown_schema_version`、値域違反は `out_of_range`、構造違反は `invalid_state` として返す。
- [ ] `TemporalUpperBodyState` の保存 shape は次に固定する。`arms.left/right` は canonical arm scalar と body-local tuple を持ち、VRM bone rotation / quaternion は含めない。

```ts
type TemporalPartState =
    | "tracked"
    | "suspect"
    | "predicted"
    | "lost"
    | "recovering";
type TemporalSource =
    | "canonical"
    | "previous"
    | "predicted"
    | "comfortable"
    | "neutral"
    | "mixed";
type TemporalWarningCode =
    | "low_confidence"
    | "dropout"
    | "prediction_active"
    | "prediction_expired"
    | "recovery_blend"
    | "velocity_damped"
    | "classification_held"
    | "out_of_range";

type TemporalPartMeta = {
    state: TemporalPartState;
    confidence: number;
    source: TemporalSource;
    stateAgeMs: number;
    observedAgeMs: number;
    warnings: TemporalWarningCode[];
};

type TemporalTuple3 = readonly [number, number, number];

type TemporalArmState = TemporalPartMeta & {
    reach: number;
    elevationRad: number;
    openness: number;
    forwardness: number;
    elbowFlexionRad: number;
    classification: "side" | "front" | "diagonal" | "crossed" | "unknown";
    bodyLocalWrist?: TemporalTuple3;
    bodyLocalElbow?: TemporalTuple3;
    velocity: {
        wrist?: TemporalTuple3;
        reachPerSec: number;
        elevationRadPerSec: number;
        opennessPerSec: number;
        forwardnessPerSec: number;
        elbowFlexionRadPerSec: number;
    };
    recoveringBlend?: {
        from: "predicted" | "comfortable" | "neutral";
        progress: number;
        durationMs: number;
    };
};

type TemporalHeadState = TemporalPartMeta & {
    yawRad: number;
    pitchRad: number;
    rollRad: number;
    angularVelocityRadPerSec: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    recoveringBlend?: {
        from: "predicted" | "comfortable" | "neutral";
        progress: number;
        durationMs: number;
    };
};

type TemporalUpperBodyState = {
    schemaVersion: typeof TEMPORAL_UPPER_BODY_SCHEMA_VERSION;
    timestamp: {
        mediaTimeMs: number;
        canonicalMediaTimeMs?: number;
        poseLastUpdatedAtMs?: number;
    };
    arms: {
        left: TemporalArmState;
        right: TemporalArmState;
    };
    head?: TemporalHeadState;
    warnings: TemporalWarningCode[];
};
```

- [ ] 値域は `confidence 0..1`、`stateAgeMs / observedAgeMs >= 0`、`reach 0..1.15`、`elevationRad -pi/2..pi/2`、`openness -1..1`、`forwardness 0..1`、`elbowFlexionRad 0..pi`、`recoveringBlend.progress 0..1`、`recoveringBlend.durationMs 180..400` に固定する。
- [ ] head は optional とし、未観測時の default state には含めない。`createDefaultTemporalUpperBodyState(mediaTimeMs, { includeHead: true })` が指定された場合だけ head を作り、`yawRad: 0`、`pitchRad: 0`、`rollRad: 0`、angular velocity は全 0、`state: "lost"`、`confidence: 0`、`source: "neutral"`、warnings `["dropout"]` で返す。
- [ ] `createDefaultTemporalUpperBodyState(mediaTimeMs)` は両腕を `state: "lost"`、`confidence: 0`、`source: "neutral"`、`stateAgeMs: 0`、`observedAgeMs: 0`、warnings `["dropout"]` で返す。neutral arm scalar は `reach: 0.35`、`elevationRad: -0.25`、`openness: 0.15`、`forwardness: 0.15`、`elbowFlexionRad: 1.15`、`classification: "side"` に固定し、`bodyLocalWrist` / `bodyLocalElbow` は省略、velocity はすべて 0 とする。
- [ ] `parseTemporalUpperBodyState()` の unit test を追加し、valid object、未知 schema、非 finite number、confidence / scalar / blend progress 範囲外、unknown enum、extra key、class instance が期待どおり accept / reject されることを確認する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に `TemporalUpperBodyState` v1 の保存 slot、state enum、canonical/reliability の後段であり VRM pose を含めない責務境界を同期する。

## 設計判断（着手前に確定済み）

- 新規モジュールの所在は `src/character/temporal/` とする。`features/gaze/*` は観測入力、`character/canonical` は body-local 意味量、`character/reliability` は観測品質であり、時系列状態は character motion pipeline の中間層として独立させる。
- 保存 contract は `CanonicalUpperBodyState` / `ReliabilityMap` と同じく zod parser + discriminated union にする。例外 throw にすると replay viewer で invalid frame を切り分けにくいため採用しない。
- `TemporalPartState` は `ReliabilityPartState` と同じ lower-case 文字列を使うが、型は別名で定義する。Reliability の `suspect` は観測品質、Temporal の `suspect` は時系列状態であり、責務が異なるため re-export で共有しない。
- `TemporalUpperBodyState` には VRM normalized pose、IK target、quaternion を入れない。Phase 5 は canonical scalar / body-local target の状態推定であり、VRM pose 合成は Phase 6 `MotionSolver / VrmPoseComposer` の責務に残す。
- `recoveringBlend.durationMs` の許容値は `180..400` に固定する。roadmap の「180-400ms 程度で blend 復帰」を contract の検証可能な範囲にするため。
- 外部 API / backend / WebRTC 契約は変更しない。入力検証は local zod parser に閉じ、parse failure は replay failure ではなく viewer 層の invalid state として扱える union で返す。

## スコープ境界

- 本タスクでやること:
    - `TemporalUpperBodyState` v1 の型、schema、parser、default factory。
    - schema / parser の unit test。
    - character motion / tracking design doc の責務境界同期。
- 本タスクでやらないこと:
    - One Euro Filter、Kalman、hysteresis、debounce の実装。
    - dropout prediction / recovering blend の実計算。
    - motion-debug live snapshot / recording / viewer への接続。
    - IK solver、retargeter、VRM pose composer の変更。

## 実装方針（既存コード整合: file:line）

- `CanonicalUpperBodyState` は `schemaVersion`、JSON 保存可能な tuple / enum、parse result を同一ファイルで定義している（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:3`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:35`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:94`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:125`）。Temporal contract もこの構成を踏襲する。
- `ReliabilityMap` は lower-case state enum と zod strict schema で JSON 境界を守っている（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:3`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:5`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:166`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:187`）。Temporal parser も unknown schema を先に判定し、値域違反と構造違反を分ける。
- motion debug log v1 には `frame.temporal` の optional slot が既に存在する（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:109`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:111`）。本タスクでは slot 名を変えず、parser だけを用意する。
- motion-debug viewer には `temporal` layer key が予約済みである（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:31`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:127`）。表示接続は後続タスクへ残す。

## テスト

- `cd sincromisor-frontend && npm run test -- temporalUpperBodyState`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な motion pipeline contract が増えるため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に `TemporalUpperBodyState` v1 の責務、保存 slot、state enum、VRM pose を含めない方針を同期する。公開 WebRTC / backend 契約は変更しない。
