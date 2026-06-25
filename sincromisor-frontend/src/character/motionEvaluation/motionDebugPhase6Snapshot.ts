import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { z } from "zod";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { ArmPoleState } from "../ik/sincroArmIkPole";
import type { SincroArmIkTarget } from "../ik/sincroArmIkTypes";
import type {
    TemporalArmIkDebugSnapshot,
    TemporalArmIkScaleSnapshot,
} from "../motionSolver/temporalArmSolverBridge";
import type { SincroPoseRetargetedArm } from "../retargeting/sincroPoseRetargeter";
import type { TemporalPartState, TemporalTuple3 } from "../temporal/temporalUpperBodyState";
import type { VrmPoseComposerResult } from "../vrmPose/vrmPoseTypes";

export const MOTION_DEBUG_PHASE6_SOLVER_SCHEMA_VERSION = "sincro.phase6-solver.v1" as const;
export const MOTION_DEBUG_FINAL_POSE_SCHEMA_VERSION = "sincro.vrm-pose-composer-result.v1" as const;

const TEMPORAL_PART_STATES = ["tracked", "suspect", "predicted", "lost", "recovering"] as const;

const ARM_POLE_STATES = ["stable", "uncertain", "extended", "lost", "recovering"] as const;

export type MotionDebugTemporalArmIkBridgeSnapshot = {
    target?: {
        wrist: TemporalTuple3;
        elbowPole: TemporalTuple3;
        weight: number;
        temporalState?: TemporalPartState;
        elbowFlexionRad?: number;
        recoveringBlendProgress?: number;
        targetReachRatio?: number;
        wristRollInfluence?: number;
    };
    reasonCodes: string[];
    scale: TemporalArmIkScaleSnapshot;
    sourceState: TemporalPartState;
    debug: TemporalArmIkDebugSnapshot;
};

export type MotionDebugPhase6ArmSolverSnapshot = {
    bridge?: MotionDebugTemporalArmIkBridgeSnapshot;
    ik?: {
        active: boolean;
        targetClamped: boolean;
        weight: number;
        poleState?: ArmPoleState;
        constraintReasonCodes: string[];
        fallbackReason?: string;
    };
};

export type MotionDebugPhase6SolverSnapshot = {
    schemaVersion: typeof MOTION_DEBUG_PHASE6_SOLVER_SCHEMA_VERSION;
    profile: {
        schemaVersion: MinimalAvatarMotionProfile["schemaVersion"];
        optionalBones: Record<string, boolean>;
        measurements: Record<string, number>;
        solverDefaults: Record<string, number>;
        warnings: string[];
    };
    arms: {
        left: MotionDebugPhase6ArmSolverSnapshot;
        right: MotionDebugPhase6ArmSolverSnapshot;
    };
    warnings: string[];
};

export type MotionDebugFinalPoseSnapshot = VrmPoseComposerResult & {
    schemaVersion: typeof MOTION_DEBUG_FINAL_POSE_SCHEMA_VERSION;
};

export type MotionDebugSnapshotParseError = {
    code: "unknown_schema_version" | "invalid_state";
    path: string[];
    message: string;
};

export type MotionDebugPhase6SolverParseResult =
    | { ok: true; snapshot: MotionDebugPhase6SolverSnapshot }
    | { ok: false; errors: MotionDebugSnapshotParseError[] };

export type MotionDebugFinalPoseParseResult =
    | { ok: true; snapshot: MotionDebugFinalPoseSnapshot }
    | { ok: false; errors: MotionDebugSnapshotParseError[] };

export type MotionDebugPhase6RuntimeInput = {
    profile?: MinimalAvatarMotionProfile;
    leftArm: SincroPoseRetargetedArm;
    rightArm: SincroPoseRetargetedArm;
};

const finiteNumberSchema = z.number().finite();
const vrmHumanBoneNameSchema = z.custom<VRMHumanBoneName>((value) => typeof value === "string", {
    message: "Expected a VRM human bone name.",
});
const tuple3Schema: z.ZodType<TemporalTuple3> = z.tuple([
    finiteNumberSchema,
    finiteNumberSchema,
    finiteNumberSchema,
]);
const temporalPartStateSchema = z.enum(TEMPORAL_PART_STATES);
const armPoleStateSchema = z.enum(ARM_POLE_STATES);

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

const stringArraySchema = z.array(z.string());

const temporalArmIkScaleSnapshotSchema: z.ZodType<TemporalArmIkScaleSnapshot> = plainObjectSchema({
    shoulderWidth: finiteNumberSchema,
    upperArmLength: finiteNumberSchema,
    lowerArmLength: finiteNumberSchema,
    armLength: finiteNumberSchema,
    defaultReachScale: finiteNumberSchema,
    lateralScale: finiteNumberSchema,
    verticalScale: finiteNumberSchema,
    depthCompression: finiteNumberSchema,
    maxReachRatio: z.literal(0.985),
});

const temporalArmIkDebugSnapshotSchema: z.ZodType<TemporalArmIkDebugSnapshot> = plainObjectSchema({
    usedBodyLocalWrist: z.boolean(),
    usedBodyLocalElbow: z.boolean(),
    shoulderLocal: tuple3Schema,
    wristBeforeClamp: tuple3Schema.optional(),
    wristAfterClamp: tuple3Schema.optional(),
    elbowPoleBeforeNormalize: tuple3Schema.optional(),
    weightBeforeStateScale: finiteNumberSchema,
    weightAfterStateScale: finiteNumberSchema,
});

const temporalArmIkTargetSnapshotSchema = plainObjectSchema({
    wrist: tuple3Schema,
    elbowPole: tuple3Schema,
    weight: finiteNumberSchema,
    temporalState: temporalPartStateSchema.optional(),
    elbowFlexionRad: finiteNumberSchema.optional(),
    recoveringBlendProgress: finiteNumberSchema.optional(),
    targetReachRatio: finiteNumberSchema.optional(),
    wristRollInfluence: finiteNumberSchema.optional(),
});

const temporalArmIkBridgeSnapshotSchema: z.ZodType<MotionDebugTemporalArmIkBridgeSnapshot> =
    plainObjectSchema({
        target: temporalArmIkTargetSnapshotSchema.optional(),
        reasonCodes: stringArraySchema,
        scale: temporalArmIkScaleSnapshotSchema,
        sourceState: temporalPartStateSchema,
        debug: temporalArmIkDebugSnapshotSchema,
    });

const phase6ArmSolverSnapshotSchema: z.ZodType<MotionDebugPhase6ArmSolverSnapshot> =
    plainObjectSchema({
        bridge: temporalArmIkBridgeSnapshotSchema.optional(),
        ik: plainObjectSchema({
            active: z.boolean(),
            targetClamped: z.boolean(),
            weight: finiteNumberSchema,
            poleState: armPoleStateSchema.optional(),
            constraintReasonCodes: stringArraySchema,
            fallbackReason: z.string().optional(),
        }).optional(),
    });

const phase6SolverSnapshotSchema: z.ZodType<MotionDebugPhase6SolverSnapshot> = plainObjectSchema({
    schemaVersion: z.literal(MOTION_DEBUG_PHASE6_SOLVER_SCHEMA_VERSION),
    profile: plainObjectSchema({
        schemaVersion: z.literal("sincro.minimal-avatar-motion-profile.v1"),
        optionalBones: z.record(z.string(), z.boolean()),
        measurements: z.record(z.string(), finiteNumberSchema),
        solverDefaults: z.record(z.string(), finiteNumberSchema),
        warnings: stringArraySchema,
    }),
    arms: plainObjectSchema({
        left: phase6ArmSolverSnapshotSchema,
        right: phase6ArmSolverSnapshotSchema,
    }),
    warnings: stringArraySchema,
});

const quaternionSchema = plainObjectSchema({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    z: finiteNumberSchema,
    w: finiteNumberSchema,
});

const finalPoseSnapshotSchema: z.ZodType<MotionDebugFinalPoseSnapshot> = plainObjectSchema({
    schemaVersion: z.literal(MOTION_DEBUG_FINAL_POSE_SCHEMA_VERSION),
    finalPose: z.record(vrmHumanBoneNameSchema, quaternionSchema),
    ownedBones: z.array(vrmHumanBoneNameSchema),
    suppressedLayers: z.array(
        plainObjectSchema({
            id: z.string(),
            kind: z.enum(["fallback", "tracking", "idle", "style"]),
            bone: vrmHumanBoneNameSchema,
            reason: z.enum(["tracking_owns_bone", "missing_optional_bone", "zero_weight"]),
        }),
    ),
    clampedBones: z.array(
        plainObjectSchema({
            bone: vrmHumanBoneNameSchema,
            reason: z.enum(["quaternion_normalized", "angular_velocity"]),
            before: quaternionSchema.optional(),
            after: quaternionSchema,
        }),
    ),
    warnings: stringArraySchema,
});

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

export function createMotionDebugPhase6SolverSnapshot(
    input: MotionDebugPhase6RuntimeInput,
): MotionDebugPhase6SolverSnapshot | undefined {
    if (input.profile === undefined) {
        return undefined;
    }
    return {
        schemaVersion: MOTION_DEBUG_PHASE6_SOLVER_SCHEMA_VERSION,
        profile: serializeMinimalAvatarMotionProfile(input.profile),
        arms: {
            left: serializeArmSolverSnapshot(input.leftArm),
            right: serializeArmSolverSnapshot(input.rightArm),
        },
        warnings: [],
    };
}

export function createMotionDebugFinalPoseSnapshot(
    result: VrmPoseComposerResult,
): MotionDebugFinalPoseSnapshot {
    return {
        schemaVersion: MOTION_DEBUG_FINAL_POSE_SCHEMA_VERSION,
        finalPose: result.finalPose,
        ownedBones: [...result.ownedBones],
        suppressedLayers: result.suppressedLayers.map((layer) => ({ ...layer })),
        clampedBones: result.clampedBones.map((clamped) => ({
            ...clamped,
            before: clamped.before ? { ...clamped.before } : undefined,
            after: { ...clamped.after },
        })),
        warnings: [...result.warnings],
    };
}

export function serializeTemporalArmIkBridgeSnapshot(input: {
    target?: SincroArmIkTarget;
    reasonCodes: string[];
    scale: TemporalArmIkScaleSnapshot;
    sourceState: TemporalPartState;
    debug: TemporalArmIkDebugSnapshot;
}): MotionDebugTemporalArmIkBridgeSnapshot {
    return {
        target: serializeArmIkTarget(input.target),
        reasonCodes: [...input.reasonCodes],
        scale: { ...input.scale },
        sourceState: input.sourceState,
        debug: {
            ...input.debug,
            shoulderLocal: [...input.debug.shoulderLocal],
            wristBeforeClamp: tupleOrUndefined(input.debug.wristBeforeClamp),
            wristAfterClamp: tupleOrUndefined(input.debug.wristAfterClamp),
            elbowPoleBeforeNormalize: tupleOrUndefined(input.debug.elbowPoleBeforeNormalize),
        },
    };
}

export function parseMotionDebugPhase6SolverSnapshot(
    value: unknown,
): MotionDebugPhase6SolverParseResult {
    return parseSnapshot(
        value,
        phase6SolverSnapshotSchema,
        MOTION_DEBUG_PHASE6_SOLVER_SCHEMA_VERSION,
    );
}

export function parseMotionDebugFinalPoseSnapshot(value: unknown): MotionDebugFinalPoseParseResult {
    return parseSnapshot(value, finalPoseSnapshotSchema, MOTION_DEBUG_FINAL_POSE_SCHEMA_VERSION);
}

function serializeMinimalAvatarMotionProfile(
    profile: MinimalAvatarMotionProfile,
): MotionDebugPhase6SolverSnapshot["profile"] {
    return {
        schemaVersion: profile.schemaVersion,
        optionalBones: { ...profile.optionalBones },
        measurements: finiteNumberRecord(profile.measurements),
        solverDefaults: finiteNumberRecord(profile.solverDefaults),
        warnings: [...profile.warnings],
    };
}

function serializeArmSolverSnapshot(
    arm: SincroPoseRetargetedArm,
): MotionDebugPhase6ArmSolverSnapshot {
    return {
        ik: {
            active: arm.ikActive,
            targetClamped:
                arm.constraint.jointLimited ||
                arm.constraint.collisionAvoided ||
                arm.constraint.targetPushDistance > 0,
            weight: arm.ikWeight,
            poleState: arm.constraint.poleState,
            constraintReasonCodes: [
                ...new Set([...(arm.constraint.reasonCodes ?? []), ...arm.constraint.reasons]),
            ],
            fallbackReason: arm.fallbackReason,
        },
    };
}

function serializeArmIkTarget(
    target: SincroArmIkTarget | undefined,
): MotionDebugTemporalArmIkBridgeSnapshot["target"] | undefined {
    if (target === undefined) {
        return undefined;
    }
    return {
        wrist: vectorToFiniteTuple(target.wrist),
        elbowPole: vectorToFiniteTuple(target.elbowPole),
        weight: target.weight,
        temporalState: target.temporalState,
        elbowFlexionRad: finiteNumberOrUndefined(target.elbowFlexionRad),
        recoveringBlendProgress: finiteNumberOrUndefined(target.recoveringBlendProgress),
        targetReachRatio: finiteNumberOrUndefined(target.targetReachRatio),
        wristRollInfluence: finiteNumberOrUndefined(target.wristRollInfluence),
    };
}

function finiteNumberRecord(input: Record<string, number | undefined>): Record<string, number> {
    const output: Record<string, number> = {};
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && Number.isFinite(value)) {
            output[key] = value;
        }
    }
    return output;
}

function vectorToFiniteTuple(vector: SincroArmIkTarget["wrist"]): TemporalTuple3 {
    return [
        finiteNumberOrZero(vector.x),
        finiteNumberOrZero(vector.y),
        finiteNumberOrZero(vector.z),
    ];
}

function tupleOrUndefined(tuple: TemporalTuple3 | undefined): TemporalTuple3 | undefined {
    return tuple === undefined ? undefined : [...tuple];
}

function finiteNumberOrUndefined(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function finiteNumberOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

function parseSnapshot<T>(
    value: unknown,
    schema: z.ZodType<T>,
    schemaVersion: string,
): { ok: true; snapshot: T } | { ok: false; errors: MotionDebugSnapshotParseError[] } {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== schemaVersion
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Motion debug snapshot schemaVersion is not supported.",
                },
            ],
        };
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        return {
            ok: false,
            errors: parsed.error.issues.map((issue) => ({
                code: "invalid_state",
                path: issue.path.map((segment) => String(segment)),
                message: issue.message,
            })),
        };
    }
    return { ok: true, snapshot: parsed.data };
}
