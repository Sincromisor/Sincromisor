import { z } from "zod";

export const TEMPORAL_UPPER_BODY_SCHEMA_VERSION = "sincro.temporal-upper-body.v1" as const;

const TEMPORAL_PART_STATE_VALUES = [
    "tracked",
    "suspect",
    "predicted",
    "lost",
    "recovering",
] as const;

const TEMPORAL_SOURCE_VALUES = [
    "canonical",
    "previous",
    "predicted",
    "comfortable",
    "neutral",
    "mixed",
] as const;

const TEMPORAL_WARNING_CODE_VALUES = [
    "low_confidence",
    "dropout",
    "prediction_active",
    "prediction_expired",
    "recovery_blend",
    "velocity_damped",
    "classification_held",
    "out_of_range",
] as const;

const TEMPORAL_ARM_CLASSIFICATION_VALUES = [
    "side",
    "front",
    "diagonal",
    "crossed",
    "unknown",
] as const;

const TEMPORAL_RECOVERING_BLEND_SOURCE_VALUES = ["predicted", "comfortable", "neutral"] as const;

export type TemporalPartState = (typeof TEMPORAL_PART_STATE_VALUES)[number];

export type TemporalSource = (typeof TEMPORAL_SOURCE_VALUES)[number];

export type TemporalWarningCode = (typeof TEMPORAL_WARNING_CODE_VALUES)[number];

export type TemporalTuple3 = readonly [number, number, number];

export type TemporalPartMeta = {
    state: TemporalPartState;
    confidence: number;
    source: TemporalSource;
    stateAgeMs: number;
    observedAgeMs: number;
    warnings: TemporalWarningCode[];
};

type TemporalArmClassification = (typeof TEMPORAL_ARM_CLASSIFICATION_VALUES)[number];

type TemporalRecoveringBlend = {
    from: "predicted" | "comfortable" | "neutral";
    progress: number;
    durationMs: number;
};

export type TemporalArmState = TemporalPartMeta & {
    reach: number;
    elevationRad: number;
    openness: number;
    forwardness: number;
    elbowFlexionRad: number;
    classification: TemporalArmClassification;
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
    recoveringBlend?: TemporalRecoveringBlend;
};

export type TemporalHeadState = TemporalPartMeta & {
    yawRad: number;
    pitchRad: number;
    rollRad: number;
    angularVelocityRadPerSec: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    recoveringBlend?: TemporalRecoveringBlend;
};

export type TemporalUpperBodyState = {
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

type TemporalUpperBodyStateParseErrorCode =
    | "unknown_schema_version"
    | "invalid_state"
    | "out_of_range";

type TemporalUpperBodyStateParseError = {
    code: TemporalUpperBodyStateParseErrorCode;
    path: string[];
    message: string;
};

export type TemporalUpperBodyStateParseResult =
    | { ok: true; state: TemporalUpperBodyState }
    | { ok: false; errors: TemporalUpperBodyStateParseError[] };

type PlainRecord = Record<string, unknown>;

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.nonnegative();
const confidenceSchema = finiteNumberSchema.min(0).max(1);
const temporalPartStateSchema = z.enum(TEMPORAL_PART_STATE_VALUES);
const temporalSourceSchema = z.enum(TEMPORAL_SOURCE_VALUES);
const temporalWarningCodeSchema = z.enum(TEMPORAL_WARNING_CODE_VALUES);
const temporalArmClassificationSchema = z.enum(TEMPORAL_ARM_CLASSIFICATION_VALUES);

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

const temporalTuple3Schema: z.ZodType<TemporalTuple3> = z.tuple([
    finiteNumberSchema,
    finiteNumberSchema,
    finiteNumberSchema,
]);

const temporalPartMetaShape = {
    state: temporalPartStateSchema,
    confidence: confidenceSchema,
    source: temporalSourceSchema,
    stateAgeMs: nonNegativeFiniteNumberSchema,
    observedAgeMs: nonNegativeFiniteNumberSchema,
    warnings: z.array(temporalWarningCodeSchema),
};

const temporalRecoveringBlendSchema: z.ZodType<TemporalRecoveringBlend> = plainObjectSchema({
    from: z.enum(TEMPORAL_RECOVERING_BLEND_SOURCE_VALUES),
    progress: confidenceSchema,
    durationMs: finiteNumberSchema.min(180).max(400),
});

const temporalArmVelocitySchema: z.ZodType<TemporalArmState["velocity"]> = plainObjectSchema({
    wrist: temporalTuple3Schema.optional(),
    reachPerSec: finiteNumberSchema,
    elevationRadPerSec: finiteNumberSchema,
    opennessPerSec: finiteNumberSchema,
    forwardnessPerSec: finiteNumberSchema,
    elbowFlexionRadPerSec: finiteNumberSchema,
});

const temporalArmStateSchema: z.ZodType<TemporalArmState> = plainObjectSchema({
    ...temporalPartMetaShape,
    reach: finiteNumberSchema.min(0).max(1.15),
    elevationRad: finiteNumberSchema.min(-Math.PI / 2).max(Math.PI / 2),
    openness: finiteNumberSchema.min(-1).max(1),
    forwardness: finiteNumberSchema.min(0).max(1),
    elbowFlexionRad: finiteNumberSchema.min(0).max(Math.PI),
    classification: temporalArmClassificationSchema,
    bodyLocalWrist: temporalTuple3Schema.optional(),
    bodyLocalElbow: temporalTuple3Schema.optional(),
    velocity: temporalArmVelocitySchema,
    recoveringBlend: temporalRecoveringBlendSchema.optional(),
});

const temporalHeadStateSchema: z.ZodType<TemporalHeadState> = plainObjectSchema({
    ...temporalPartMetaShape,
    yawRad: finiteNumberSchema,
    pitchRad: finiteNumberSchema,
    rollRad: finiteNumberSchema,
    angularVelocityRadPerSec: plainObjectSchema({
        yaw: finiteNumberSchema,
        pitch: finiteNumberSchema,
        roll: finiteNumberSchema,
    }),
    recoveringBlend: temporalRecoveringBlendSchema.optional(),
});

const temporalUpperBodyStateSchema: z.ZodType<TemporalUpperBodyState> = plainObjectSchema({
    schemaVersion: z.literal(TEMPORAL_UPPER_BODY_SCHEMA_VERSION),
    timestamp: plainObjectSchema({
        mediaTimeMs: finiteNumberSchema,
        canonicalMediaTimeMs: finiteNumberSchema.optional(),
        poseLastUpdatedAtMs: finiteNumberSchema.optional(),
    }),
    arms: plainObjectSchema({
        left: temporalArmStateSchema,
        right: temporalArmStateSchema,
    }),
    head: temporalHeadStateSchema.optional(),
    warnings: z.array(temporalWarningCodeSchema),
});

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

function createDefaultPartMeta(): TemporalPartMeta {
    return {
        state: "lost",
        confidence: 0,
        source: "neutral",
        stateAgeMs: 0,
        observedAgeMs: 0,
        warnings: ["dropout"],
    };
}

function createDefaultArmState(): TemporalArmState {
    return {
        ...createDefaultPartMeta(),
        reach: 0.35,
        elevationRad: -0.25,
        openness: 0.15,
        forwardness: 0.15,
        elbowFlexionRad: 1.15,
        classification: "side",
        velocity: {
            reachPerSec: 0,
            elevationRadPerSec: 0,
            opennessPerSec: 0,
            forwardnessPerSec: 0,
            elbowFlexionRadPerSec: 0,
        },
    };
}

function createDefaultHeadState(): TemporalHeadState {
    return {
        ...createDefaultPartMeta(),
        yawRad: 0,
        pitchRad: 0,
        rollRad: 0,
        angularVelocityRadPerSec: {
            yaw: 0,
            pitch: 0,
            roll: 0,
        },
    };
}

function zodPathToStrings(path: readonly PropertyKey[]): string[] {
    return path.map((segment) => String(segment));
}

function classifyIssue(issue: z.core.$ZodIssue): TemporalUpperBodyStateParseErrorCode {
    if (
        (issue.code === "too_small" || issue.code === "too_big") &&
        "origin" in issue &&
        issue.origin === "number"
    ) {
        return "out_of_range";
    }
    return "invalid_state";
}

export function parseTemporalUpperBodyState(value: unknown): TemporalUpperBodyStateParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== TEMPORAL_UPPER_BODY_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Temporal upper body schemaVersion is not supported.",
                },
            ],
        };
    }

    const parsed = temporalUpperBodyStateSchema.safeParse(value);
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

export function createDefaultTemporalUpperBodyState(
    mediaTimeMs: number,
    options: { includeHead?: boolean } = {},
): TemporalUpperBodyState {
    const state: TemporalUpperBodyState = {
        schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs,
        },
        arms: {
            left: createDefaultArmState(),
            right: createDefaultArmState(),
        },
        warnings: ["dropout"],
    };

    if (options.includeHead === true) {
        state.head = createDefaultHeadState();
    }

    return state;
}
