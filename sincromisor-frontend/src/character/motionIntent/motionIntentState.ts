import { z } from "zod";

export const MOTION_INTENT_SCHEMA_VERSION = "sincro.motion-intent.v1" as const;

const ARM_MOTION_INTENT_VALUES = [
    "tracking",
    "wave",
    "pointing",
    "thumbsUp",
    "peace",
    "nearFace",
    "explain",
    "clapLike",
    "guarded",
    "lost",
    "fallback",
] as const;

const TORSO_MOTION_INTENT_VALUES = ["neutral", "leaning", "turning", "settling"] as const;

const MOTION_INTENT_SOURCE_VALUES = [
    "temporal",
    "hand",
    "gesture",
    "reliability",
    "fallback",
    "mixed",
] as const;

const TORSO_MOTION_INTENT_SOURCE_VALUES = ["temporal", "fallback", "mixed"] as const;

const MOTION_INTENT_WARNING_CODE_VALUES = [
    "low_hand_reliability",
    "low_pose_reliability",
    "gesture_unstable",
    "gesture_cooldown",
    "wave_motion_missing",
    "near_face_hold",
    "left_right_swap_suspect",
    "fallback_active",
    "invalid_dt",
] as const;

export type ArmMotionIntent = (typeof ARM_MOTION_INTENT_VALUES)[number];

export type TorsoMotionIntent = (typeof TORSO_MOTION_INTENT_VALUES)[number];

export type MotionIntentWarningCode = (typeof MOTION_INTENT_WARNING_CODE_VALUES)[number];

type MotionIntentSource = (typeof MOTION_INTENT_SOURCE_VALUES)[number];

type TorsoMotionIntentSource = (typeof TORSO_MOTION_INTENT_SOURCE_VALUES)[number];

export type MotionIntentSideState = {
    intent: ArmMotionIntent;
    confidence: number;
    reliability: number;
    expressiveness: number;
    ageMs: number;
    stableDurationMs: number;
    cooldownRemainingMs: number;
    source: MotionIntentSource;
    sourceGestureLabel?: string;
    warnings: MotionIntentWarningCode[];
};

export type MotionIntentState = {
    schemaVersion: typeof MOTION_INTENT_SCHEMA_VERSION;
    timestamp: { mediaTimeMs: number };
    arms: { left: MotionIntentSideState; right: MotionIntentSideState };
    torso: {
        intent: TorsoMotionIntent;
        confidence: number;
        source: TorsoMotionIntentSource;
        warnings: MotionIntentWarningCode[];
    };
    warnings: MotionIntentWarningCode[];
};

export type MotionIntentParseErrorCode =
    | "unknown_schema_version"
    | "invalid_state"
    | "out_of_range";

export type MotionIntentParseError = {
    code: MotionIntentParseErrorCode;
    path: string[];
    message: string;
};

export type MotionIntentParseResult =
    | { ok: true; state: MotionIntentState }
    | { ok: false; errors: MotionIntentParseError[] };

type PlainRecord = Record<string, unknown>;

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.nonnegative();
const confidenceSchema = finiteNumberSchema.min(0).max(1);
const armMotionIntentSchema = z.enum(ARM_MOTION_INTENT_VALUES);
const torsoMotionIntentSchema = z.enum(TORSO_MOTION_INTENT_VALUES);
const motionIntentSourceSchema = z.enum(MOTION_INTENT_SOURCE_VALUES);
const torsoMotionIntentSourceSchema = z.enum(TORSO_MOTION_INTENT_SOURCE_VALUES);
const motionIntentWarningCodeSchema = z.enum(MOTION_INTENT_WARNING_CODE_VALUES);

function isPlainRecord(value: unknown): value is PlainRecord {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function plainObjectSchema<Shape extends z.core.$ZodLooseShape>(shape: Shape) {
    return z
        .custom<PlainRecord>(isPlainRecord, { message: "Expected a plain object." })
        .pipe(z.object(shape).strict());
}

const motionIntentSideStateSchema: z.ZodType<MotionIntentSideState> = plainObjectSchema({
    intent: armMotionIntentSchema,
    confidence: confidenceSchema,
    reliability: confidenceSchema,
    expressiveness: confidenceSchema,
    ageMs: nonNegativeFiniteNumberSchema,
    stableDurationMs: nonNegativeFiniteNumberSchema,
    cooldownRemainingMs: nonNegativeFiniteNumberSchema,
    source: motionIntentSourceSchema,
    sourceGestureLabel: z.string().optional(),
    warnings: z.array(motionIntentWarningCodeSchema),
});

const motionIntentStateSchema: z.ZodType<MotionIntentState> = plainObjectSchema({
    schemaVersion: z.literal(MOTION_INTENT_SCHEMA_VERSION),
    timestamp: plainObjectSchema({
        mediaTimeMs: nonNegativeFiniteNumberSchema,
    }),
    arms: plainObjectSchema({
        left: motionIntentSideStateSchema,
        right: motionIntentSideStateSchema,
    }),
    torso: plainObjectSchema({
        intent: torsoMotionIntentSchema,
        confidence: confidenceSchema,
        source: torsoMotionIntentSourceSchema,
        warnings: z.array(motionIntentWarningCodeSchema),
    }),
    warnings: z.array(motionIntentWarningCodeSchema),
});

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

function zodPathToStrings(path: readonly PropertyKey[]): string[] {
    return path.map((segment) => String(segment));
}

function classifyIssue(issue: z.core.$ZodIssue): MotionIntentParseErrorCode {
    if (
        (issue.code === "too_small" || issue.code === "too_big") &&
        "origin" in issue &&
        issue.origin === "number"
    ) {
        return "out_of_range";
    }
    return "invalid_state";
}

function createDefaultSideState(): MotionIntentSideState {
    return {
        intent: "tracking",
        confidence: 0,
        reliability: 0,
        expressiveness: 0,
        ageMs: 0,
        stableDurationMs: 0,
        cooldownRemainingMs: 0,
        source: "fallback",
        warnings: ["fallback_active"],
    };
}

function cloneSideState(state: MotionIntentSideState): MotionIntentSideState {
    return {
        intent: state.intent,
        confidence: state.confidence,
        reliability: state.reliability,
        expressiveness: state.expressiveness,
        ageMs: state.ageMs,
        stableDurationMs: state.stableDurationMs,
        cooldownRemainingMs: state.cooldownRemainingMs,
        source: state.source,
        sourceGestureLabel: state.sourceGestureLabel,
        warnings: [...state.warnings],
    };
}

export function parseMotionIntentState(value: unknown): MotionIntentParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== MOTION_INTENT_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Motion intent schemaVersion is not supported.",
                },
            ],
        };
    }

    const parsed = motionIntentStateSchema.safeParse(value);
    if (!parsed.success) {
        return {
            ok: false,
            errors: parsed.error.issues.map((issue) => ({
                code: classifyIssue(issue),
                path: zodPathToStrings(issue.path),
                message: issue.message,
            })),
        };
    }

    return { ok: true, state: parsed.data };
}

export function createDefaultMotionIntentState(mediaTimeMs: number): MotionIntentState {
    return {
        schemaVersion: MOTION_INTENT_SCHEMA_VERSION,
        timestamp: { mediaTimeMs },
        arms: {
            left: createDefaultSideState(),
            right: createDefaultSideState(),
        },
        torso: {
            intent: "neutral",
            confidence: 0,
            source: "fallback",
            warnings: ["fallback_active"],
        },
        warnings: ["fallback_active"],
    };
}

export function cloneMotionIntentState(state: MotionIntentState): MotionIntentState {
    return {
        schemaVersion: state.schemaVersion,
        timestamp: {
            mediaTimeMs: state.timestamp.mediaTimeMs,
        },
        arms: {
            left: cloneSideState(state.arms.left),
            right: cloneSideState(state.arms.right),
        },
        torso: {
            intent: state.torso.intent,
            confidence: state.torso.confidence,
            source: state.torso.source,
            warnings: [...state.torso.warnings],
        },
        warnings: [...state.warnings],
    };
}
