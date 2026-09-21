/**
 * motion metric calculator が読む replay frame slot を個別 parser で正規化する境界。
 * invalid optional layer は recording 全体の失敗にせず、layer 単位の parse error / undefined として summary に渡す。
 */
import { z } from "zod";
import { type MotionIntentState, parseMotionIntentState } from "../motionIntent/motionIntentState";
import {
    parseTemporalUpperBodyState,
    type TemporalUpperBodyState,
} from "../temporal/temporalUpperBodyState";
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import {
    type MotionDebugFinalPoseSnapshot,
    type MotionDebugPhase6SolverSnapshot,
    parseMotionDebugFinalPoseSnapshot,
    parseMotionDebugPhase6SolverSnapshot,
} from "./motionDebugPhase6Snapshot";

// 保存 contract の外部境界は replay frame 内の unknown slot であり、ここで Zod / parser に閉じる。
// metric group の計算式、threshold 判定、baseline comparison はこの module では扱わない。
const poseWristSchema = z.looseObject({
    cameraX: z.number(),
    cameraY: z.number(),
    confidence: z.number().optional(),
});

const poseSnapshotSchema = z.looseObject({
    detected: z.boolean(),
    degradedToFaceOnly: z.boolean().optional(),
    consecutiveFailures: z.number().optional(),
    upperBody: z.looseObject({
        shoulderCenterX: z.number(),
        shoulderCenterY: z.number(),
    }),
    leftArm: z.looseObject({
        targets: z.looseObject({
            wrist: poseWristSchema,
        }),
    }),
    rightArm: z.looseObject({
        targets: z.looseObject({
            wrist: poseWristSchema,
        }),
    }),
});

const armConstraintSchema = z.looseObject({
    reasons: z.array(z.string()).optional(),
    jointLimited: z.boolean().optional(),
    targetPushDistance: z.number().optional(),
});

const quaternionSchema = z.strictObject({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    w: z.number(),
});

const retargetArmSchema = z.looseObject({
    constraint: armConstraintSchema.optional(),
    upperArmQuaternion: quaternionSchema.optional(),
    lowerArmQuaternion: quaternionSchema.optional(),
});

const poseRetargetSchema = z.looseObject({
    leftArm: retargetArmSchema,
    rightArm: retargetArmSchema,
});

const solverSchema = z.looseObject({
    poseRetarget: poseRetargetSchema.optional(),
});

const appliedSchema = z.looseObject({
    angularVelocityDegPerSec: z.union([z.number(), z.record(z.string(), z.number())]),
});

const trackerMetricsSchema = z.looseObject({
    workerRoundTripMs: z.number().optional(),
});

const metricsSchema = z.looseObject({
    tracker: trackerMetricsSchema.optional(),
});

export type PoseSnapshotMetricInput = z.infer<typeof poseSnapshotSchema>;
export type PoseRetargetMetricInput = z.infer<typeof poseRetargetSchema>;
export type AppliedMetricInput = z.infer<typeof appliedSchema>;
export type QuaternionMetricInput = z.infer<typeof quaternionSchema>;

export type ParsedIntentFrame =
    | { status: "missing" }
    | { status: "invalid" }
    | { status: "valid"; intent: MotionIntentState };

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePoseSnapshot(
    frame: SincroMotionDebugFrame,
): PoseSnapshotMetricInput | undefined {
    const parsed = poseSnapshotSchema.safeParse(frame.poseSnapshot);
    return parsed.success ? parsed.data : undefined;
}

export function parsePoseRetarget(
    frame: SincroMotionDebugFrame,
): PoseRetargetMetricInput | undefined {
    const solver = solverSchema.safeParse(frame.solver);
    if (!solver.success || solver.data.poseRetarget === undefined) {
        return undefined;
    }
    return solver.data.poseRetarget;
}

export function parseApplied(frame: SincroMotionDebugFrame): AppliedMetricInput | undefined {
    const parsed = appliedSchema.safeParse(frame.applied);
    return parsed.success ? parsed.data : undefined;
}

export function parseMetrics(
    frame: SincroMotionDebugFrame,
): z.infer<typeof metricsSchema> | undefined {
    const parsed = metricsSchema.safeParse(frame.metrics);
    return parsed.success ? parsed.data : undefined;
}

export function parseTemporal(frame: SincroMotionDebugFrame): TemporalUpperBodyState | undefined {
    const parsed = parseTemporalUpperBodyState(frame.temporal);
    return parsed.ok ? parsed.state : undefined;
}

export function parsePhase6Solver(
    frame: SincroMotionDebugFrame,
): MotionDebugPhase6SolverSnapshot | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    const parsed = parseMotionDebugPhase6SolverSnapshot(frame.solver.phase6);
    return parsed.ok ? parsed.snapshot : undefined;
}

export function parseFinalPose(
    frame: SincroMotionDebugFrame,
): MotionDebugFinalPoseSnapshot | undefined {
    const parsed = parseMotionDebugFinalPoseSnapshot(frame.finalPose);
    return parsed.ok ? parsed.snapshot : undefined;
}

export function parseIntent(frame: SincroMotionDebugFrame): ParsedIntentFrame {
    if (frame.intent === undefined) {
        return { status: "missing" };
    }
    const parsed = parseMotionIntentState(frame.intent);
    if (!parsed.ok) {
        return { status: "invalid" };
    }
    return { status: "valid", intent: parsed.state };
}
