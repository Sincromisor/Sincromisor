/**
 * 旧 retarget runtime snapshot と composer dry-run result の差分 metric contract。
 *
 * 入力は replay / live snapshot から取り出した plain object に限定し、VRM Object3D、
 * normalized bone node、`THREE.Quaternion` instance は受け取らない。summary は
 * `sincro.composer-comparison-summary.v1` として既存 `sincro.motion-metrics.v1` とは分け、
 * feature flag 適用判断の材料だけを出す。ここでは実適用の合否を自動決定しない。
 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { z } from "zod";
import type { SincroArmIkConstraintSnapshot } from "../ik/sincroArmIkConstraint";
import type { SincroArmIkQuaternion } from "../ik/sincroArmIkSolver";
import {
    NEUTRAL_POSE_FRAME,
    type SincroPoseArmIkMode,
    type SincroPoseIkMode,
    type SincroPoseRetargetedArm,
    type SincroPoseRetargetFrame,
} from "../retargeting/sincroPoseRetargetTypes";
import type { SincroVrmPoseComposerDryRunResult } from "../runtime/sincroVrmPoseComposerDryRun";
import type { VrmPoseComposerResult, VrmPoseQuaternion } from "../vrmPose/vrmPoseTypes";
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import type {
    MotionMetricDirection,
    MotionMetricSeverity,
    MotionMetricStatus,
    MotionMetricThreshold,
    MotionMetricUnit,
    MotionP0FixtureId,
} from "./motionMetricTypes";

/**
 * composer comparison summary の固定 schema version。
 *
 * `sincro.motion-metrics.v1` の key set へ混ぜると既存 baseline comparison の互換性を壊すため、
 * composer 適用判断用の artifact は専用 schema として扱う。
 */
export const COMPOSER_COMPARISON_SUMMARY_SCHEMA_VERSION =
    "sincro.composer-comparison-summary.v1" as const;

/**
 * composer comparison の固定 metric key 順序。
 *
 * artifact、Debug Console 表示、テスト fixture の結合キーであり、rename は過去 summary の破壊的変更になる。
 * `composerMissingPoseFrameCount` は availability failure を pass 色へ隠さないため、実測 metric と同じ表へ
 * 常に含める。
 */
export const COMPOSER_COMPARISON_METRIC_KEYS = [
    "composerAngleDeltaDeg",
    "composerAngularVelocitySpike",
    "composerOwnedBoneConflictCount",
    "composerSuppressionCount",
    "composerMissingPoseFrameCount",
] as const;

export type ComposerComparisonMetricKey = (typeof COMPOSER_COMPARISON_METRIC_KEYS)[number];

/**
 * frame 単位 comparison helper の入力。
 *
 * `retarget` は `frame.solver.poseRetargetRuntime` から作った `SincroPoseRetargetFrame`、
 * `composerDryRun` は production dry-run の status 付き result だけを受ける。保存境界に
 * VRM / Three.js runtime object を出さないため、media time と plain object snapshot 以外は持たせない。
 */
export type ComposerComparisonMetricFrameInput = {
    mediaTimeMs: number;
    retarget?: SincroPoseRetargetFrame;
    composerDryRun?: SincroVrmPoseComposerDryRunResult;
};

/**
 * frame 単位 comparison helper の出力。
 *
 * `values` は summary 集計用の raw frame 値で、threshold 判定は summary 側だけで行う。
 * `status: "not_available"` でも `composerMissingPoseFrameCount` は 1 になり、欠損 frame を
 * 暗黙 pass として落とさない。
 */
export type ComposerComparisonMetricFrameResult = {
    mediaTimeMs: number;
    status: "available" | "not_available";
    comparedBoneCount: number;
    values: Record<ComposerComparisonMetricKey, number>;
    warnings: string[];
    unavailableReason?: ComposerComparisonUnavailableReason;
};

export type ComposerComparisonMetricResult = {
    key: ComposerComparisonMetricKey;
    value: number | null;
    unit: MotionMetricUnit;
    status: MotionMetricStatus;
    severity: MotionMetricSeverity;
    direction: MotionMetricDirection;
    threshold: MotionMetricThreshold;
    sampleCount: number;
    unavailableReason?: ComposerComparisonUnavailableReason;
};

export type ComposerComparisonSummaryStatus = "available" | "comparison_unavailable";

export type ComposerComparisonUnavailableReason =
    | "baseline_not_captured"
    | "retarget_or_composer_not_recorded";

export type ComposerComparisonSummaryInputs = {
    baselineManifestPath: string;
    replayLog: {
        available: boolean;
        path?: string;
    };
    composerDryRunResult: {
        available: boolean;
        source?: "frame.finalPose" | "live-snapshot" | "caller";
    };
};

/**
 * composer comparison summary artifact の保存 contract。
 *
 * `status: "comparison_unavailable"` は warn 以上で、`not-captured` baseline や dry-run 欠損を
 * pass にしないための状態である。`inputs` は path と有無だけを plain object で残し、replay log 本体や
 * VRM runtime object は保存しない。
 */
export type ComposerComparisonSummary = {
    schemaVersion: typeof COMPOSER_COMPARISON_SUMMARY_SCHEMA_VERSION;
    fixtureId: MotionP0FixtureId | string;
    baselineSource: "captured" | "synthetic" | "not-captured" | "unknown";
    status: ComposerComparisonSummaryStatus;
    severity: MotionMetricSeverity;
    metrics: Record<ComposerComparisonMetricKey, ComposerComparisonMetricResult>;
    warnings: string[];
    unavailableReason?: ComposerComparisonUnavailableReason;
    generatedAtIso: string;
    inputs: ComposerComparisonSummaryInputs;
};

export type ComposerComparisonSummaryConfig = {
    fixtureId: MotionP0FixtureId | string;
    baselineSource: ComposerComparisonSummary["baselineSource"];
    generatedAtIso: string;
    inputs: ComposerComparisonSummaryInputs;
};

type ComposerComparisonMetricDefinition = {
    unit: MotionMetricUnit;
    direction: MotionMetricDirection;
    threshold: MotionMetricThreshold;
};

type BonePair = {
    retargetSide: "leftArm" | "rightArm";
    retargetQuaternion: "upperArmQuaternion" | "lowerArmQuaternion";
    composerBone: VRMHumanBoneName;
};

const COMPOSER_COMPARISON_METRIC_DEFINITIONS: Record<
    ComposerComparisonMetricKey,
    ComposerComparisonMetricDefinition
> = {
    composerAngleDeltaDeg: {
        unit: "deg",
        direction: "lower_is_better",
        threshold: { pass: 12, warn: 25, fail: 45 },
    },
    composerAngularVelocitySpike: {
        unit: "count",
        direction: "lower_is_better",
        threshold: { pass: 0, warn: 2, fail: 5 },
    },
    composerOwnedBoneConflictCount: {
        unit: "count",
        direction: "lower_is_better",
        threshold: { pass: 0, warn: 0, fail: 0 },
    },
    composerSuppressionCount: {
        unit: "count",
        direction: "lower_is_better",
        threshold: { pass: 0, warn: 30, fail: 120 },
    },
    composerMissingPoseFrameCount: {
        unit: "count",
        direction: "lower_is_better",
        threshold: { pass: 0, warn: 1, fail: 3 },
    },
};

const COMPOSER_COMPARISON_BONE_PAIRS: BonePair[] = [
    {
        retargetSide: "leftArm",
        retargetQuaternion: "upperArmQuaternion",
        composerBone: "leftUpperArm",
    },
    {
        retargetSide: "leftArm",
        retargetQuaternion: "lowerArmQuaternion",
        composerBone: "leftLowerArm",
    },
    {
        retargetSide: "rightArm",
        retargetQuaternion: "upperArmQuaternion",
        composerBone: "rightUpperArm",
    },
    {
        retargetSide: "rightArm",
        retargetQuaternion: "lowerArmQuaternion",
        composerBone: "rightLowerArm",
    },
];

const OWNED_BONE_CONFLICT_PREFIX = "owned_bone_conflict:";

const finiteNumberSchema = z.number().finite();
const quaternionSchema: z.ZodType<SincroArmIkQuaternion> = plainObjectSchema({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    z: finiteNumberSchema,
    w: finiteNumberSchema,
});
const eulerLikeSchema = plainObjectSchema({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    z: finiteNumberSchema,
});
const armIkModeSchema: z.ZodType<SincroPoseArmIkMode | "none"> = z.enum([
    "feature_only",
    "screen_space_ik",
    "world_3d_ik",
    "none",
]);
const poseIkModeSchema: z.ZodType<SincroPoseIkMode> = z.enum([
    "fallback",
    "feature_only",
    "screen_space_ik",
    "world_3d_ik",
]);
const constraintSchema: z.ZodType<SincroArmIkConstraintSnapshot> = plainObjectSchema({
    reasons: z.array(z.string()),
    jointLimited: z.boolean(),
    poleStabilized: z.boolean(),
    collisionAvoided: z.boolean(),
    weightScale: finiteNumberSchema,
    targetPushDistance: finiteNumberSchema,
    poleState: z.enum(["stable", "uncertain", "extended", "lost", "recovering"]).optional(),
    reasonCodes: z.array(z.string()).optional(),
    angularVelocityClamped: z.boolean().optional(),
    wristRollDamped: z.boolean().optional(),
    wristRollInfluence: finiteNumberSchema.optional(),
});
const retargetArmSchema: z.ZodType<SincroPoseRetargetedArm> = plainObjectSchema({
    active: z.boolean(),
    ikActive: z.boolean(),
    ikWeight: finiteNumberSchema,
    ikSolverMode: armIkModeSchema,
    fallbackReason: z.string().optional(),
    constraint: constraintSchema,
    upperArm: eulerLikeSchema,
    lowerArm: eulerLikeSchema,
    wrist: eulerLikeSchema,
    upperArmQuaternion: quaternionSchema.optional(),
    lowerArmQuaternion: quaternionSchema.optional(),
});
const poseRetargetRuntimeSchema = plainObjectSchema({
    active: z.boolean(),
    confidence: finiteNumberSchema,
    ikMode: poseIkModeSchema,
    fallbackReason: z.string().optional(),
    solverProbe: loosePlainObjectSchema({}),
    anchor: plainObjectSchema({
        active: z.boolean(),
        weight: finiteNumberSchema,
        reason: z.string(),
        shoulderOffset: plainObjectSchema({
            x: finiteNumberSchema,
            y: finiteNumberSchema,
        }),
    }),
    leftArm: retargetArmSchema,
    rightArm: retargetArmSchema,
});

const dryRunStatusSchema = z.enum(["available", "not_ready", "invalid_input", "missing_profile"]);
const fullNormalizedPoseApplicationModeSchema = z.enum(["off", "upper_body"]);
const vrmHumanBoneNameSchema = z.custom<VRMHumanBoneName>((value) => typeof value === "string", {
    message: "Expected a VRM human bone name.",
});
const composerQuaternionSchema: z.ZodType<VrmPoseQuaternion> = plainObjectSchema({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    z: finiteNumberSchema,
    w: finiteNumberSchema,
});
const composerResultSchema: z.ZodType<VrmPoseComposerResult> = plainObjectSchema({
    finalPose: z.record(vrmHumanBoneNameSchema, composerQuaternionSchema),
    ownedBones: z.array(vrmHumanBoneNameSchema),
    suppressedLayers: z.array(
        plainObjectSchema({
            id: z.string(),
            kind: z.enum(["fallback", "tracking", "semantic", "idle", "style"]),
            bone: vrmHumanBoneNameSchema,
            reason: z.enum([
                "tracking_owns_bone",
                "missing_optional_bone",
                "zero_weight",
                "semantic_conflict",
            ]),
        }),
    ),
    clampedBones: z.array(
        plainObjectSchema({
            bone: vrmHumanBoneNameSchema,
            reason: z.enum(["quaternion_normalized", "angular_velocity"]),
            before: composerQuaternionSchema.optional(),
            after: composerQuaternionSchema,
        }),
    ),
    warnings: z.array(z.string()),
});
const dryRunResultSchema: z.ZodType<SincroVrmPoseComposerDryRunResult> = plainObjectSchema({
    status: dryRunStatusSchema,
    result: composerResultSchema.optional(),
    warnings: z.array(z.string()),
    fullNormalizedPoseApplication: plainObjectSchema({
        mode: fullNormalizedPoseApplicationModeSchema,
        applied: z.boolean(),
        rollbackReason: z.string().optional(),
    }).optional(),
});
const solverRuntimeSchema = loosePlainObjectSchema({
    poseRetargetRuntime: z.unknown().optional(),
});

/**
 * 1 frame の旧 retarget と composer dry-run result を比較する。
 *
 * angle delta は left/right upper/lower arm の対応 bone だけを見る。`upperBody` は
 * `poseRetargetRuntime` parser が neutral 補完する保存欠損領域であり、この metric の対象にしない。
 * angular velocity は dry-run result の `clampedBones.reason === "angular_velocity"` を数え、
 * helper 入力へ前 frame を追加して再計算しない。
 */
export function calculateComposerComparisonMetrics(
    input: ComposerComparisonMetricFrameInput,
): ComposerComparisonMetricFrameResult {
    const retarget = input.retarget;
    const composerDryRun = input.composerDryRun;
    if (
        retarget === undefined ||
        composerDryRun === undefined ||
        composerDryRun.status !== "available" ||
        composerDryRun.result === undefined
    ) {
        return createMissingFrameResult(input.mediaTimeMs, "retarget_or_composer_not_recorded");
    }

    const result = composerDryRun.result;
    const angleDeltas = collectAngleDeltas(retarget, result.finalPose);
    if (angleDeltas.length === 0) {
        return createMissingFrameResult(input.mediaTimeMs, "retarget_or_composer_not_recorded");
    }

    return {
        mediaTimeMs: input.mediaTimeMs,
        status: "available",
        comparedBoneCount: angleDeltas.length,
        values: {
            composerAngleDeltaDeg: Math.max(...angleDeltas),
            composerAngularVelocitySpike: countUniqueAngularVelocityClamps(result),
            composerOwnedBoneConflictCount: countUniqueOwnedBoneConflictWarnings(result),
            composerSuppressionCount: result.suppressedLayers.length,
            composerMissingPoseFrameCount: 0,
        },
        warnings: [...composerDryRun.warnings],
    };
}

/**
 * replay frame から comparison helper 入力を作る parser。
 *
 * retarget は `frame.solver.poseRetargetRuntime` だけを正本にし、旧 slot の
 * `frame.solver.poseRetarget` は読まない。runtime snapshot は現行 recording で `upperBody` を持たないため、
 * `NEUTRAL_POSE_FRAME` を土台に active / confidence / ikMode / fallbackReason / solverProbe / anchor /
 * leftArm / rightArm だけを上書きする。欠損または invalid の場合は fallback 再計算せず、summary 側の
 * `composerMissingPoseFrameCount` に 1 frame として現れる。
 */
export function parseComposerComparisonFrameInput(
    frame: SincroMotionDebugFrame,
): ComposerComparisonMetricFrameInput {
    return {
        mediaTimeMs: frame.timestamp.mediaTimeMs,
        retarget: parsePoseRetargetRuntime(frame),
        composerDryRun: parseComposerDryRunFromFrame(frame),
    };
}

/**
 * composer comparison summary artifact を作る。
 *
 * available frame が 1 件以上ある場合だけ measured metric を summary 化する。全 frame が missing の
 * captured replay は `comparison_unavailable` とし、dry-run 欠損や runtime retarget 欠損を
 * pass 判定にしない。
 */
export function calculateComposerComparisonSummary(
    frames: readonly ComposerComparisonMetricFrameInput[],
    config: ComposerComparisonSummaryConfig,
): ComposerComparisonSummary {
    if (config.baselineSource === "not-captured") {
        return createComposerComparisonUnavailableSummary(config, "baseline_not_captured", [
            "Baseline source is not-captured; angle delta was not synthesized.",
        ]);
    }

    const frameResults = frames.map(calculateComposerComparisonMetrics);
    const availableFrames = frameResults.filter((frame) => frame.status === "available");
    if (availableFrames.length === 0) {
        return createComposerComparisonUnavailableSummary(
            config,
            "retarget_or_composer_not_recorded",
            ["No frame had both poseRetargetRuntime and available composer dry-run result."],
        );
    }

    const metrics = createAvailableSummaryMetrics(frameResults, availableFrames);
    return {
        schemaVersion: COMPOSER_COMPARISON_SUMMARY_SCHEMA_VERSION,
        fixtureId: config.fixtureId,
        baselineSource: config.baselineSource,
        status: "available",
        severity: maxMetricSeverity(metrics),
        metrics,
        warnings: collectFrameWarnings(frameResults),
        generatedAtIso: config.generatedAtIso,
        inputs: config.inputs,
    };
}

/**
 * availability failure 用の comparison summary を作る。
 *
 * `baseline_not_captured` と captured replay の `retarget_or_composer_not_recorded` を別 reason code にし、
 * 5 metric すべてを `not_available` / warn 以上として出力する。これにより artifact や Debug Console が
 * 未比較状態を pass 色で表示しない。
 */
export function createComposerComparisonUnavailableSummary(
    config: ComposerComparisonSummaryConfig,
    unavailableReason: ComposerComparisonUnavailableReason,
    warnings: readonly string[],
): ComposerComparisonSummary {
    return {
        schemaVersion: COMPOSER_COMPARISON_SUMMARY_SCHEMA_VERSION,
        fixtureId: config.fixtureId,
        baselineSource: config.baselineSource,
        status: "comparison_unavailable",
        severity: "warn",
        metrics: createUnavailableMetrics(unavailableReason),
        warnings: [...warnings],
        unavailableReason,
        generatedAtIso: config.generatedAtIso,
        inputs: config.inputs,
    };
}

function parsePoseRetargetRuntime(
    frame: SincroMotionDebugFrame,
): SincroPoseRetargetFrame | undefined {
    const solver = solverRuntimeSchema.safeParse(frame.solver);
    if (!solver.success || solver.data.poseRetargetRuntime === undefined) {
        return undefined;
    }
    const runtime = poseRetargetRuntimeSchema.safeParse(solver.data.poseRetargetRuntime);
    if (!runtime.success) {
        return undefined;
    }
    return {
        ...structuredClone(NEUTRAL_POSE_FRAME),
        active: runtime.data.active,
        confidence: runtime.data.confidence,
        ikMode: runtime.data.ikMode,
        fallbackReason: runtime.data.fallbackReason,
        solverProbe: structuredClone(runtime.data.solverProbe),
        anchor: structuredClone(runtime.data.anchor),
        leftArm: structuredClone(runtime.data.leftArm),
        rightArm: structuredClone(runtime.data.rightArm),
    };
}

function parseComposerDryRunFromFrame(
    frame: SincroMotionDebugFrame,
): SincroVrmPoseComposerDryRunResult | undefined {
    /*
        `sincro.vrm-pose-composer-result.v1` の legacy finalPose layer は dry-run の status contract を持たない。
        ここで available に昇格すると、dry-run 未記録の旧 log を比較済み pass と誤読するため、
        status 付き production dry-run result snapshot だけを受理する。
    */
    const dryRun = dryRunResultSchema.safeParse(frame.finalPose);
    return dryRun.success ? dryRun.data : undefined;
}

function createMissingFrameResult(
    mediaTimeMs: number,
    unavailableReason: ComposerComparisonUnavailableReason,
): ComposerComparisonMetricFrameResult {
    return {
        mediaTimeMs,
        status: "not_available",
        comparedBoneCount: 0,
        values: {
            composerAngleDeltaDeg: 0,
            composerAngularVelocitySpike: 0,
            composerOwnedBoneConflictCount: 0,
            composerSuppressionCount: 0,
            composerMissingPoseFrameCount: 1,
        },
        warnings: [],
        unavailableReason,
    };
}

function collectAngleDeltas(
    retarget: SincroPoseRetargetFrame,
    finalPose: VrmPoseComposerResult["finalPose"],
): number[] {
    const deltas: number[] = [];
    for (const pair of COMPOSER_COMPARISON_BONE_PAIRS) {
        const retargetQuaternion = retarget[pair.retargetSide][pair.retargetQuaternion];
        const composerQuaternion = finalPose[pair.composerBone];
        if (retargetQuaternion !== undefined && composerQuaternion !== undefined) {
            deltas.push(quaternionGeodesicDistanceDeg(retargetQuaternion, composerQuaternion));
        }
    }
    return deltas;
}

function quaternionGeodesicDistanceDeg(
    left: SincroArmIkQuaternion,
    right: VrmPoseQuaternion,
): number {
    const leftLength = quaternionLength(left);
    const rightLength = quaternionLength(right);
    if (leftLength === 0 || rightLength === 0) {
        return 180;
    }
    const dot =
        (left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w) /
        (leftLength * rightLength);
    const clampedDot = Math.min(1, Math.max(-1, Math.abs(dot)));
    return (2 * Math.acos(clampedDot) * 180) / Math.PI;
}

function quaternionLength(quaternion: SincroArmIkQuaternion | VrmPoseQuaternion): number {
    return Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
}

function countUniqueAngularVelocityClamps(result: VrmPoseComposerResult): number {
    const bones = result.clampedBones
        .filter((clamped) => clamped.reason === "angular_velocity")
        .map((clamped) => clamped.bone);
    return new Set(bones).size;
}

function countUniqueOwnedBoneConflictWarnings(result: VrmPoseComposerResult): number {
    return new Set(
        result.warnings.filter((warning) => warning.startsWith(OWNED_BONE_CONFLICT_PREFIX)),
    ).size;
}

function createAvailableSummaryMetrics(
    frameResults: readonly ComposerComparisonMetricFrameResult[],
    availableFrames: readonly ComposerComparisonMetricFrameResult[],
): Record<ComposerComparisonMetricKey, ComposerComparisonMetricResult> {
    return {
        composerAngleDeltaDeg: createMeasuredMetric(
            "composerAngleDeltaDeg",
            percentile95(availableFrames.map((frame) => frame.values.composerAngleDeltaDeg)),
            availableFrames.length,
        ),
        composerAngularVelocitySpike: createMeasuredMetric(
            "composerAngularVelocitySpike",
            sumValues(availableFrames, "composerAngularVelocitySpike"),
            availableFrames.length,
        ),
        composerOwnedBoneConflictCount: createMeasuredMetric(
            "composerOwnedBoneConflictCount",
            sumValues(availableFrames, "composerOwnedBoneConflictCount"),
            availableFrames.length,
        ),
        composerSuppressionCount: createMeasuredMetric(
            "composerSuppressionCount",
            sumValues(availableFrames, "composerSuppressionCount"),
            availableFrames.length,
        ),
        composerMissingPoseFrameCount: createMeasuredMetric(
            "composerMissingPoseFrameCount",
            sumValues(frameResults, "composerMissingPoseFrameCount"),
            frameResults.length,
        ),
    };
}

function createMeasuredMetric(
    key: ComposerComparisonMetricKey,
    value: number,
    sampleCount: number,
): ComposerComparisonMetricResult {
    const definition = COMPOSER_COMPARISON_METRIC_DEFINITIONS[key];
    const severity = statusForValue(value, definition.threshold, definition.direction);
    return {
        key,
        value,
        unit: definition.unit,
        status: severity,
        severity,
        direction: definition.direction,
        threshold: definition.threshold,
        sampleCount,
    };
}

function createUnavailableMetrics(
    unavailableReason: ComposerComparisonUnavailableReason,
): Record<ComposerComparisonMetricKey, ComposerComparisonMetricResult> {
    return {
        composerAngleDeltaDeg: createUnavailableMetric("composerAngleDeltaDeg", unavailableReason),
        composerAngularVelocitySpike: createUnavailableMetric(
            "composerAngularVelocitySpike",
            unavailableReason,
        ),
        composerOwnedBoneConflictCount: createUnavailableMetric(
            "composerOwnedBoneConflictCount",
            unavailableReason,
        ),
        composerSuppressionCount: createUnavailableMetric(
            "composerSuppressionCount",
            unavailableReason,
        ),
        composerMissingPoseFrameCount: createUnavailableMetric(
            "composerMissingPoseFrameCount",
            unavailableReason,
        ),
    };
}

function createUnavailableMetric(
    key: ComposerComparisonMetricKey,
    unavailableReason: ComposerComparisonUnavailableReason,
): ComposerComparisonMetricResult {
    const definition = COMPOSER_COMPARISON_METRIC_DEFINITIONS[key];
    return {
        key,
        value: null,
        unit: definition.unit,
        status: "not_available",
        severity: "warn",
        direction: definition.direction,
        threshold: definition.threshold,
        sampleCount: 0,
        unavailableReason,
    };
}

function statusForValue(
    value: number,
    threshold: MotionMetricThreshold,
    direction: MotionMetricDirection,
): MotionMetricSeverity {
    if (direction === "lower_is_better") {
        if (value <= threshold.pass) {
            return "pass";
        }
        if (value <= threshold.warn) {
            return "warn";
        }
        return "fail";
    }

    if (value >= threshold.pass) {
        return "pass";
    }
    if (value >= threshold.warn) {
        return "warn";
    }
    return "fail";
}

function percentile95(values: readonly number[]): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    return sorted[index] ?? 0;
}

function sumValues(
    frames: readonly ComposerComparisonMetricFrameResult[],
    key: ComposerComparisonMetricKey,
): number {
    return frames.reduce((sum, frame) => sum + frame.values[key], 0);
}

function maxMetricSeverity(
    metrics: Record<ComposerComparisonMetricKey, ComposerComparisonMetricResult>,
): MotionMetricSeverity {
    if (COMPOSER_COMPARISON_METRIC_KEYS.some((key) => metrics[key].severity === "fail")) {
        return "fail";
    }
    if (COMPOSER_COMPARISON_METRIC_KEYS.some((key) => metrics[key].severity === "warn")) {
        return "warn";
    }
    return "pass";
}

function collectFrameWarnings(frames: readonly ComposerComparisonMetricFrameResult[]): string[] {
    return [...new Set(frames.flatMap((frame) => frame.warnings))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function plainObjectSchema<Shape extends z.core.$ZodLooseShape>(shape: Shape) {
    return z
        .custom<Record<string, unknown>>(isPlainRecord, { message: "Expected a plain object." })
        .pipe(z.object(shape).strict());
}

function loosePlainObjectSchema<Shape extends z.core.$ZodLooseShape>(shape: Shape) {
    return z
        .custom<Record<string, unknown>>(isPlainRecord, { message: "Expected a plain object." })
        .pipe(z.object(shape).passthrough());
}
