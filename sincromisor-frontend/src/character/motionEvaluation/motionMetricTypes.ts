/**
 * Motion QA metric の key、severity、unit、threshold、summary、comparison 型を定義する。
 * metric key は regression artifact と baseline の結合キーであり、追加・削除時は thresholds と design doc を同時に確認する。
 */
// motion metrics の保存 contract は summary JSON の schemaVersion と fixed metric key を境界にする。
// この module は公開型だけを持ち、replay frame の検証、metric 計算、QA regression の判定は扱わない。
export type MotionP0FixtureId =
    | "neutral-10s"
    | "single-arm-slow-raise"
    | "both-arms-slow-raise"
    | "hand-out-and-return"
    | "arms-cross"
    | "fast-wave";

export type MotionMetricKey =
    | "neutralJitter"
    | "elbowFlipCount"
    | "recoveryJumpAngleDeg"
    | "angularVelocitySpikeCount"
    | "reachClampOccupancy"
    | "trackingLossDurationMs"
    | "sideSwapCount"
    | "addedLatencyMs"
    | "temporalPredictedArmFrameCount"
    | "temporalRecoveringArmFrameCount"
    | "temporalLostArmDurationMs"
    | "temporalMaxRecoveryJumpDegEquivalent"
    | "temporalNeutralWristJitter"
    | "solverElbowFlipRejectCount"
    | "solverReachClampOccupancy"
    | "solverExcessReachRatioP95"
    | "solverPoleUncertainFrameCount"
    | "finalPoseAngularVelocityClampCount"
    | "finalPoseOwnedBoneConflictCount"
    | "gestureFlickerCount"
    | "semanticFallbackFrameCount"
    | "intentCooldownSuppressionCount"
    | "intentInvalidFrameCount"
    | "trackerBudgetOverrunFrameCount"
    | "trackerDroppedFrameCount"
    | "degradationStageFrameCount"
    | "degradationRecoveryFrameCount"
    | "roiPausedFrameCount";

export type MotionMetricSeverity = "pass" | "warn" | "fail";
export type MotionMetricStatus = MotionMetricSeverity | "not_available";
export type MotionMetricDirection = "lower_is_better" | "higher_is_better";
export type MotionMetricUnit = "px" | "deg" | "count" | "ratio" | "ms";

export type MotionMetricThreshold = { pass: number; warn: number; fail: number };

export type MotionMetricResult = {
    key: MotionMetricKey;
    value: number | null;
    unit: MotionMetricUnit;
    status: MotionMetricStatus;
    severity: MotionMetricSeverity;
    direction: MotionMetricDirection;
    threshold: MotionMetricThreshold;
    sampleCount: number;
    unavailableReason?: string;
};

export type MotionMetricSummary = {
    schemaVersion: "sincro.motion-metrics.v1";
    fixtureId?: MotionP0FixtureId;
    generatedAtIso: string;
    frameCount: number;
    durationMs: number;
    severity: MotionMetricSeverity;
    metrics: Record<MotionMetricKey, MotionMetricResult>;
};

export type MotionMetricConfig = {
    fixtureId?: MotionP0FixtureId;
    generatedAtIso: string;
    thresholds?: Partial<Record<MotionMetricKey, MotionMetricThreshold>>;
    thresholdVersion: "initial-v1" | "custom";
};

export type MotionMetricComparison = {
    key: MotionMetricKey;
    status: "improved" | "unchanged" | "regressed" | "not_comparable";
    baselineValue: number | null;
    candidateValue: number | null;
    delta: number | null;
    severityChanged: boolean;
};

export type NumericMetricComputation =
    | { ok: true; value: number; sampleCount: number }
    | { ok: false; reason: string; sampleCount: number };
