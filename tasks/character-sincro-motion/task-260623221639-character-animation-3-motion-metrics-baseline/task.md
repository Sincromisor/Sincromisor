# character animation 3.0 motion metrics baseline

## 背景 / 目的

Phase 1 は、調整前後の品質差を主観だけでなく数値で比較できることを完了条件にしている。roadmap の Metrics 章は `neutral jitter`、`elbow flip count`、`recovery jump angle`、`angular velocity spike`、`reach clamp occupancy`、`tracking loss duration`、`side swap count` などを最低限の metrics として挙げている。

このタスクでは、replay log から計算できる初期 metrics と pass / warn / fail の閾値、P0 固定テストモーションの baseline 保存形式を実装する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts` を追加し、`MotionMetricKey`、`MotionMetricSeverity`、`MotionMetricSummary`、`calculateMotionMetricSummary(frames, config)` を export する。
- [ ] v1 初期 metrics は `neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`angularVelocitySpikeCount`、`reachClampOccupancy`、`trackingLossDurationMs`、`sideSwapCount`、`addedLatencyMs` を定義する。入力 slot が不足する metric は `status: "not_available"` とし、0 扱いで PASS にしない。
- [ ] metric result / summary / threshold / comparison / baseline schema は本タスクの「設計判断」にある型へ固定する。
- [ ] metric ごとの入力 slot、欠損条件、単位、改善方向、初期閾値は本タスクの「設計判断」にある表へ固定する。`not_available` の metric は summary 全体を `severity: "warn"` 以上にし、PASS 扱いにしない。
- [ ] 各 metric は `pass`、`warn`、`fail` の初期閾値を `DEFAULT_MOTION_METRIC_THRESHOLDS` に持つ。初期値は調整前でもよいが、閾値未定義の subjective-only metric を完了扱いにしない。
- [ ] `baseline` / `candidate` の 2 summary を比較し、metric ごとに `improved`、`unchanged`、`regressed`、`not_comparable` を返す `compareMotionMetricSummaries()` を追加する。
- [ ] P0 固定テストモーション ID を `neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、`arms-cross`、`fast-wave` に固定し、baseline JSON の schema を専用 `sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts` で validation する。
- [ ] `MotionReplayPlayer` の replay frames から metrics summary を生成でき、`motion-debug` window API で `calculateReplayMetrics(config)` が成功時に summary を返す。
- [ ] 代表的な synthetic frame fixture で、tracking loss duration、reach clamp occupancy、missing input の `not_available` が期待値どおりになる Vitest を追加する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` へ metrics summary、baseline/candidate 比較、tracking loss / latency 入力境界を同期する。

## 設計判断（着手前に確定済み）

- metrics core は `src/character/motionEvaluation/` に置き、UI 表示は後続 viewer タスクへ分ける。
- 初期 metrics は `SincroMotionDebugFrame[]` と `MotionMetricConfig` だけを読む pure function とする。DOM、VRM instance、MediaPipe detector、`performance.now()`、`new Date()` には依存させない。
- 入力が足りない metric は `not_available` にする。未実装 / 未記録の値を 0 と解釈すると regression を隠すため。
- P0 固定テストモーションは「動画そのもの」ではなく、log / baseline に付ける `fixtureId` として定義する。実動画 fixture の配置や撮影は別タスクにできるようにする。
- `addedLatencyMs` は Phase 3 の FrameClock 前は `frame.metrics.tracker.workerRoundTripMs` の p95 として計算し、不足時は `not_available` にする。`frame.timestamp.mediaTimeMs` と `frame.metrics.receivedAtPerformanceMs` は時刻原点が異なるため、v1 metrics では差分を取らない。

metrics の最小型:

```ts
type MotionMetricSeverity = "pass" | "warn" | "fail";
type MotionMetricStatus = MotionMetricSeverity | "not_available";
type MotionMetricDirection = "lower_is_better" | "higher_is_better";

type MotionMetricResult = {
    key: MotionMetricKey;
    value: number | null;
    unit: "px" | "deg" | "count" | "ratio" | "ms";
    status: MotionMetricStatus;
    severity: MotionMetricSeverity;
    direction: MotionMetricDirection;
    threshold: { pass: number; warn: number; fail: number };
    sampleCount: number;
    unavailableReason?: string;
};

type MotionMetricSummary = {
    schemaVersion: "sincro.motion-metrics.v1";
    fixtureId?: MotionP0FixtureId;
    generatedAtIso: string;
    frameCount: number;
    durationMs: number;
    severity: MotionMetricSeverity;
    metrics: Record<MotionMetricKey, MotionMetricResult>;
};

type MotionMetricConfig = {
    fixtureId?: MotionP0FixtureId;
    generatedAtIso: string;
    thresholds?: Partial<
        Record<MotionMetricKey, { pass: number; warn: number; fail: number }>
    >;
    thresholdVersion: "initial-v1" | "custom";
};
```

`not_available` は metric result の `status` にだけ使い、`severity` は `"warn"` にする。summary severity は各 metric の最大 severity とし、`not_available` を含む summary は最低 `"warn"` にする。

`calculateMotionMetricSummary(frames, config)` は `config.generatedAtIso` をそのまま summary に入れ、関数内で現在時刻を生成しない。`config.thresholds` 未指定の metric は `DEFAULT_MOTION_METRIC_THRESHOLDS` を使う。`config.fixtureId` が未指定の場合、fixture 固有 metric の `neutralJitter` は `not_available` にする。

初期 metric 契約:

| key                         | input slot                                                                                                                                                    | 欠損条件                                                | 計算 / 単位                                                                                      | direction         | pass / warn / fail     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------- | ---------------------- |
| `neutralJitter`             | `frame.poseSnapshot.upperBody.shoulderCenterX/Y`, `frame.poseSnapshot.leftArm.targets.wrist.cameraX/Y`, `frame.poseSnapshot.rightArm.targets.wrist.cameraX/Y` | `fixtureId !== "neutral-10s"` または有効 sample 30 未満 | 各 target の平均との差分 RMS の最大値 / `ratio`                                                  | `lower_is_better` | `0.015 / 0.035 / 0.06` |
| `elbowFlipCount`            | `frame.solver.poseRetarget.leftArm.constraint.reasons`, `frame.solver.poseRetarget.rightArm.constraint.reasons`                                               | `frame.solver.poseRetarget` 欠落                        | reason に `elbow_pole_stabilized` または `elbow_flip` を含む frame 数 / `count`                  | `lower_is_better` | `0 / 2 / 5`            |
| `recoveryJumpAngleDeg`      | `frame.poseSnapshot.detected`, `frame.poseSnapshot.degradedToFaceOnly`, `frame.poseSnapshot.consecutiveFailures`, `frame.timestamp.mediaTimeMs`, `frame.applied.angularVelocityDegPerSec`、fallback として `frame.solver.poseRetarget` quaternion slot | recovery event なし、または角速度入力と quaternion fallback の両方欠落 | lost/degraded から recovered へ戻った frame 直後 500ms の最大角速度を 60fps 換算角度へ変換 / `deg`。両方ある場合は `applied` を優先 | `lower_is_better` | `8 / 18 / 35`          |
| `angularVelocitySpikeCount` | `frame.applied.angularVelocityDegPerSec`                                                                                                                      | `frame.applied` 欠落                                    | 720deg/s 超過 bone-frame 数 / `count`                                                            | `lower_is_better` | `0 / 3 / 8`            |
| `reachClampOccupancy`       | `frame.solver.poseRetarget.leftArm.constraint.jointLimited`, `targetPushDistance`, `rightArm.constraint.jointLimited`, `targetPushDistance`                   | `frame.solver.poseRetarget` 欠落                        | どちらかの腕で `jointLimited === true` または `targetPushDistance > 0` になった frame 比 / `ratio` | `lower_is_better` | `0.05 / 0.18 / 0.35`   |
| `trackingLossDurationMs`    | `frame.poseSnapshot.detected`, `frame.poseSnapshot.degradedToFaceOnly`, `frame.timestamp.mediaTimeMs`                                                         | `frame.poseSnapshot` 欠落                               | `detected === false || degradedToFaceOnly === true` の連続区間合計 / `ms`                        | `lower_is_better` | `250 / 1000 / 2500`    |
| `sideSwapCount`             | `frame.poseSnapshot.leftArm.targets.wrist.cameraX`, `confidence`, `frame.poseSnapshot.rightArm.targets.wrist.cameraX`, `confidence`                           | `frame.poseSnapshot` 欠落、または wrist confidence 入力欠落 | 左右 wrist の screen x order が前後 frame で反転し、両 wrist confidence > 0.5 の回数 / `count`   | `lower_is_better` | `0 / 1 / 3`            |
| `addedLatencyMs`            | `frame.metrics.tracker.workerRoundTripMs`                                                                                                                     | `frame.metrics.tracker` 欠落、または有効 sample なし    | tracker worker round trip の p95 / `ms`                                                          | `lower_is_better` | `80 / 160 / 260`       |

`recoveryJumpAngleDeg` の recovery event は、直前 frame が `detected === false || degradedToFaceOnly === true || consecutiveFailures > 0` で、現在 frame が `detected === true && degradedToFaceOnly !== true && consecutiveFailures === 0` になった点とする。500ms window は現在 frame の `frame.timestamp.mediaTimeMs` を開始時刻とし、`start <= mediaTimeMs < start + 500` の frame を対象にする。quaternion fallback は `frame.solver.poseRetarget.leftArm/rightArm.upperArmQuaternion` と `lowerArmQuaternion` の連続 frame 間角度から角速度を推定する。

comparison shape:

```ts
type MotionMetricComparison = {
    key: MotionMetricKey;
    status: "improved" | "unchanged" | "regressed" | "not_comparable";
    baselineValue: number | null;
    candidateValue: number | null;
    delta: number | null;
    severityChanged: boolean;
};
```

比較 tolerance は ratio metric `0.01`、ms / deg / px metric `1`、count metric `0` とする。片側でも `not_available` なら `not_comparable`。severity が悪化した場合は値の tolerance に関係なく `regressed`、severity が改善した場合は `improved`。severity が同じ場合は direction と tolerance で判定する。

baseline schema は `motionMetricBaselineSchema.ts` に固定する:

```ts
type MotionMetricBaseline = {
    schemaVersion: "sincro.motion-metric-baseline.v1";
    fixtureId: MotionP0FixtureId;
    logId: string;
    thresholdVersion: "initial-v1";
    metricSummary: MotionMetricSummary;
};
```

validation failure は `{ ok: false; errors: { code: "invalid_baseline" | "unknown_fixture_id" | "invalid_metric_summary"; message: string; path: string[] }[] }` を返す。

baseline parser の export 名は `parseMotionMetricBaseline(value: unknown)` とし、戻り値は次へ固定する:

```ts
type MotionMetricBaselineParseResult =
    | { ok: true; baseline: MotionMetricBaseline }
    | {
          ok: false;
          errors: {
              code:
                  | "invalid_baseline"
                  | "unknown_fixture_id"
                  | "invalid_metric_summary";
              message: string;
              path: string[];
          }[];
      };
```

motion-debug window API の metrics 追加 shape:

```ts
type MotionDebugReplayMetricsResult =
    | { ok: true; summary: MotionMetricSummary }
    | { ok: false; code: "no_recording_loaded"; message: string };

type MotionDebugApi = {
    calculateReplayMetrics: (
        config: MotionMetricConfig,
    ) => MotionDebugReplayMetricsResult;
};
```

`calculateReplayMetrics(config)` は API 側で時刻を生成せず、`config.generatedAtIso` を必須入力として metrics core に渡す。replay 未ロード時は例外ではなく `{ ok: false, code: "no_recording_loaded", ... }` を返す。

## スコープ境界

- 本タスクでやること:
    - metrics 型、閾値、summary 計算。
    - baseline / candidate 比較。
    - P0 fixture ID と baseline JSON validation。
    - replay result からの summary 生成 API。
- 本タスクでやらないこと:
    - UI の tab / table / chart 表示。
    - 実 camera での baseline 採取と threshold 調整。
    - canonical / temporal / intent の詳細 metrics。
    - CI regression gate への組み込み。

## 実装方針（既存コード整合: file:line）

- roadmap の Metrics 章は最低限の metric 名と入力層を定義している（`documents/research/character_animation/roadmap.md:549`）。本タスクの `MotionMetricKey` はこの名前を camelCase にしたものへ固定する。
- `SincroPoseRetargetedArm.constraint` は constraint reasons、weightScale、targetPushDistance を持つ（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:8`）。`reachClampOccupancy` はこの solver / constraint slot から取れる値を優先し、不足時は `not_available` にする。
- `SincroPoseMotionSnapshot` は `consecutiveFailures`、`degradedToFaceOnly`、`fallbackReason` を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:79`）。`trackingLossDurationMs` は pose snapshot と frame timestamp から計算する。
- `SincroTrackerWorkerStats` は worker mode、transfer / round trip、droppedFrames を持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:14`）。`addedLatencyMs` は `frame.metrics.tracker.workerRoundTripMs` を初期入力にし、`frame.timestamp.mediaTimeMs` と `frame.metrics.receivedAtPerformanceMs` の差分は取らない。
- フロントの test script は `vitest run` である（`sincromisor-frontend/package.json:9`）。metrics は pure function として Vitest で網羅する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run build`
- synthetic fixture で次を検証する:
    - 連続 lost frame の duration が timestamp 差分で計算される。
    - `jointLimited` または `targetPushDistance > 0` の frame occupancy が frame count 比で計算される。
    - 入力 slot 欠落 metric が `not_available` になり、PASS 扱いにならない。
    - baseline / candidate 比較で悪化方向が `regressed` になる。
- `npm run tasks:check`

## ドキュメント同期の要否

要。`documents/design/frontend/character/motion.md` に metrics summary / baseline / candidate 比較を同期し、`documents/design/frontend/character/tracking.md` には tracking loss / latency など tracker 由来 metrics の入力境界を同期する。
