import { z } from "zod";

export const CANONICAL_UPPER_BODY_SCHEMA_VERSION = "sincro.canonical-upper-body.v1" as const;

export const CANONICAL_SOURCE_VALUES = [
    "pose",
    "hand",
    "face",
    "previous",
    "predicted",
    "neutral",
    "mixed",
] as const;

/**
 * `CanonicalUpperBodyState` の part / top-level warning として保存できる code 一覧。
 *
 * replay / motion-debug の保存 contract であり、旧 log 互換のため warning 自体は optional な part 欠損とは
 * 独立して扱う。Face matrix 系 warning は canonical head の fallback 理由を Pose world 座標欠損と分けて残す。
 */
export const CANONICAL_WARNING_CODE_VALUES = [
    "torso_frame_unreliable",
    "front_flip_rejected",
    "left_right_swap_suspect",
    "dropout",
    "recovery_blend",
    "out_of_range",
    "low_confidence",
    "missing_world_coordinates",
    "face_matrix_missing",
    "face_matrix_invalid",
    "calibration_missing",
] as const;

export const CANONICAL_ARM_CLASSIFICATION_VALUES = [
    "side",
    "front",
    "diagonal",
    "crossed",
    "unknown",
] as const;

export type CanonicalTuple3 = readonly [number, number, number];

export type CanonicalSource = (typeof CANONICAL_SOURCE_VALUES)[number];

export type CanonicalWarningCode = (typeof CANONICAL_WARNING_CODE_VALUES)[number];

export type CanonicalOutOfRangeField = {
    path: string;
    value: number;
    min?: number;
    max?: number;
    clampedValue: number;
};

export type CanonicalPartMeta = {
    confidence: number;
    source: CanonicalSource;
    warnings: CanonicalWarningCode[];
    outOfRangeFields: CanonicalOutOfRangeField[];
};

export type CanonicalCalibrationSnapshot = {
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

export type CanonicalTorsoFrame = CanonicalPartMeta & {
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

export type CanonicalArmClassification = (typeof CANONICAL_ARM_CLASSIFICATION_VALUES)[number];

export type CanonicalArmState = CanonicalPartMeta & {
    reach: number;
    elevationRad: number;
    openness: number;
    forwardness: number;
    elbowFlexionRad: number;
    classification: CanonicalArmClassification;
    bodyLocalWrist?: CanonicalTuple3;
    bodyLocalElbow?: CanonicalTuple3;
};

export type CanonicalUpperBodyState = {
    schemaVersion: typeof CANONICAL_UPPER_BODY_SCHEMA_VERSION;
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

export type CanonicalUpperBodyStateParseErrorCode =
    | "unknown_schema_version"
    | "invalid_state"
    | "out_of_range";

export type CanonicalUpperBodyStateParseError = {
    code: CanonicalUpperBodyStateParseErrorCode;
    path: string[];
    message: string;
};

export type CanonicalUpperBodyStateParseResult =
    | { ok: true; state: CanonicalUpperBodyState }
    | { ok: false; errors: CanonicalUpperBodyStateParseError[] };

export const DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT: CanonicalCalibrationSnapshot = {
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

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.nonnegative();
const confidenceSchema = finiteNumberSchema.min(0).max(1);
const canonicalSourceSchema = z.enum(CANONICAL_SOURCE_VALUES);
const canonicalWarningCodeSchema = z.enum(CANONICAL_WARNING_CODE_VALUES);
const canonicalArmClassificationSchema = z.enum(CANONICAL_ARM_CLASSIFICATION_VALUES);

const canonicalTuple3Schema: z.ZodType<CanonicalTuple3> = z.tuple([
    finiteNumberSchema,
    finiteNumberSchema,
    finiteNumberSchema,
]);

const canonicalOutOfRangeFieldSchema: z.ZodType<CanonicalOutOfRangeField> = z
    .object({
        path: z.string(),
        value: finiteNumberSchema,
        min: finiteNumberSchema.optional(),
        max: finiteNumberSchema.optional(),
        clampedValue: finiteNumberSchema,
    })
    .strict();

const canonicalPartMetaShape = {
    confidence: confidenceSchema,
    source: canonicalSourceSchema,
    warnings: z.array(canonicalWarningCodeSchema),
    outOfRangeFields: z.array(canonicalOutOfRangeFieldSchema),
};

const canonicalCalibrationHandBaselineSchema = z
    .object({
        palmSize: nonNegativeFiniteNumberSchema,
        openSpread: nonNegativeFiniteNumberSchema,
    })
    .strict();

const canonicalCalibrationSnapshotSchema: z.ZodType<CanonicalCalibrationSnapshot> = z
    .object({
        id: z.string(),
        source: z.enum(["default", "initial", "online", "replay"]),
        neutralYawRad: finiteNumberSchema,
        shoulderWidth: nonNegativeFiniteNumberSchema,
        torsoScale: nonNegativeFiniteNumberSchema,
        handBaseline: z
            .object({
                left: canonicalCalibrationHandBaselineSchema,
                right: canonicalCalibrationHandBaselineSchema,
            })
            .strict(),
        capturedAtMediaTimeMs: finiteNumberSchema.optional(),
    })
    .strict();

const canonicalTorsoFrameSchema: z.ZodType<CanonicalTorsoFrame> = z
    .object({
        ...canonicalPartMetaShape,
        coordinateSystem: z.literal("body_local"),
        shoulderCenter: canonicalTuple3Schema,
        hipCenter: canonicalTuple3Schema.optional(),
        bodyRight: canonicalTuple3Schema,
        bodyUp: canonicalTuple3Schema,
        bodyFront: canonicalTuple3Schema,
        shoulderWidth: nonNegativeFiniteNumberSchema,
        torsoScale: nonNegativeFiniteNumberSchema,
        yawRad: finiteNumberSchema,
    })
    .strict();

const canonicalArmStateSchema: z.ZodType<CanonicalArmState> = z
    .object({
        ...canonicalPartMetaShape,
        reach: finiteNumberSchema.min(0).max(1.15),
        elevationRad: finiteNumberSchema.min(-Math.PI / 2).max(Math.PI / 2),
        openness: finiteNumberSchema.min(-1).max(1),
        forwardness: finiteNumberSchema.min(0).max(1),
        elbowFlexionRad: finiteNumberSchema.min(0).max(Math.PI),
        classification: canonicalArmClassificationSchema,
        bodyLocalWrist: canonicalTuple3Schema.optional(),
        bodyLocalElbow: canonicalTuple3Schema.optional(),
    })
    .strict();

const canonicalHeadStateSchema = z
    .object({
        ...canonicalPartMetaShape,
        yawRad: finiteNumberSchema,
        pitchRad: finiteNumberSchema,
        rollRad: finiteNumberSchema,
    })
    .strict();

export const canonicalUpperBodyStateSchema: z.ZodType<CanonicalUpperBodyState> = z
    .object({
        schemaVersion: z.literal(CANONICAL_UPPER_BODY_SCHEMA_VERSION),
        timestamp: z
            .object({
                mediaTimeMs: finiteNumberSchema,
                poseLastUpdatedAtMs: finiteNumberSchema.optional(),
            })
            .strict(),
        torso: canonicalTorsoFrameSchema,
        head: canonicalHeadStateSchema.optional(),
        arms: z
            .object({
                left: canonicalArmStateSchema,
                right: canonicalArmStateSchema,
            })
            .strict(),
        calibration: canonicalCalibrationSnapshotSchema,
        warnings: z.array(canonicalWarningCodeSchema),
    })
    .strict();

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

function zodPathToStrings(path: readonly PropertyKey[]): string[] {
    return path.map((segment) => String(segment));
}

function classifyIssue(issue: z.core.$ZodIssue): CanonicalUpperBodyStateParseErrorCode {
    if (
        (issue.code === "too_small" || issue.code === "too_big") &&
        "origin" in issue &&
        issue.origin === "number"
    ) {
        return "out_of_range";
    }
    return "invalid_state";
}

export function parseCanonicalUpperBodyState(value: unknown): CanonicalUpperBodyStateParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== CANONICAL_UPPER_BODY_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Canonical upper body schemaVersion is not supported.",
                },
            ],
        };
    }

    const parsed = canonicalUpperBodyStateSchema.safeParse(value);
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
