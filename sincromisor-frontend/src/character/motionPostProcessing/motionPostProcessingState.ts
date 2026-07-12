import { z } from "zod";
import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import { parseCanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import type { MotionIntentState } from "../motionIntent/motionIntentState";
import { parseMotionIntentState } from "../motionIntent/motionIntentState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import { parseTemporalUpperBodyState } from "../temporal/temporalUpperBodyState";

export const MOTION_POST_PROCESSING_SCHEMA_VERSION = "sincro.motion-post-processing.v1" as const;

export type MotionPostProcessingInput = {
    canonical?: CanonicalUpperBodyState;
    temporal?: TemporalUpperBodyState;
    intent?: MotionIntentState;
    reliability?: ReliabilityMap;
    mediaTimeMs: number;
    source: "live" | "replay" | "fixture";
};

export type MotionPostProcessingMode = "disabled" | "rule_based" | "learned";
export type MotionPostProcessingTarget = "canonical" | "temporal" | "intent";
export type MotionPostProcessingCorrectionKind =
    | "jitter_smoothing"
    | "dropout_fill"
    | "gesture_sequence_classification"
    | "anomaly_rejection"
    | "ik_refinement_hint";

export type MotionPostProcessingCorrection = {
    target: MotionPostProcessingTarget;
    path: string;
    kind: MotionPostProcessingCorrectionKind;
    confidence: number;
    reasonCode:
        | "noop"
        | "neutral_jitter"
        | "recovery_jump"
        | "side_swap_suspect"
        | "gesture_flicker"
        | "tracking_loss"
        | "solver_limit";
    previousValue?: unknown;
    nextValue?: unknown;
};

export type MotionPostProcessingResult = {
    schemaVersion: typeof MOTION_POST_PROCESSING_SCHEMA_VERSION;
    timestamp: { mediaTimeMs: number };
    processor: {
        id: string;
        version: string;
        mode: MotionPostProcessingMode;
    };
    inputAvailability: {
        canonical: boolean;
        temporal: boolean;
        intent: boolean;
        reliability: boolean;
    };
    output: {
        canonical?: CanonicalUpperBodyState;
        temporal?: TemporalUpperBodyState;
        intent?: MotionIntentState;
    };
    corrections: MotionPostProcessingCorrection[];
    warnings: Array<
        | "input_missing"
        | "invalid_output"
        | "low_confidence"
        | "model_unavailable"
        | "processor_disabled"
    >;
};

export type MotionPostProcessingParseErrorCode =
    | "unknown_schema_version"
    | "invalid_state"
    | "out_of_range";

export type MotionPostProcessingParseError = {
    code: MotionPostProcessingParseErrorCode;
    path: string[];
    message: string;
};

export type MotionPostProcessingParseResult =
    | { ok: true; result: MotionPostProcessingResult }
    | { ok: false; errors: MotionPostProcessingParseError[] };

type PlainRecord = Record<string, unknown>;

const MOTION_POST_PROCESSING_MODE_VALUES = ["disabled", "rule_based", "learned"] as const;
const MOTION_POST_PROCESSING_TARGET_VALUES = ["canonical", "temporal", "intent"] as const;
const MOTION_POST_PROCESSING_CORRECTION_KIND_VALUES = [
    "jitter_smoothing",
    "dropout_fill",
    "gesture_sequence_classification",
    "anomaly_rejection",
    "ik_refinement_hint",
] as const;
const MOTION_POST_PROCESSING_REASON_CODE_VALUES = [
    "noop",
    "neutral_jitter",
    "recovery_jump",
    "side_swap_suspect",
    "gesture_flicker",
    "tracking_loss",
    "solver_limit",
] as const;
const MOTION_POST_PROCESSING_WARNING_VALUES = [
    "input_missing",
    "invalid_output",
    "low_confidence",
    "model_unavailable",
    "processor_disabled",
] as const;

const finiteNumberSchema = z.number().finite();
const confidenceSchema = finiteNumberSchema.min(0).max(1);

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

function isFiniteNumberValue(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isThreeRuntimeObjectLike(value: PlainRecord): boolean {
    if (value.isVector3 === true || value.isQuaternion === true) {
        return true;
    }
    const keys = Object.keys(value);
    const hasVector3Keys =
        keys.length === 3 &&
        isFiniteNumberValue(value.x) &&
        isFiniteNumberValue(value.y) &&
        isFiniteNumberValue(value.z);
    const hasQuaternionKeys =
        keys.length === 4 &&
        isFiniteNumberValue(value.x) &&
        isFiniteNumberValue(value.y) &&
        isFiniteNumberValue(value.z) &&
        isFiniteNumberValue(value.w);
    return hasVector3Keys || hasQuaternionKeys;
}

function isSerializableCorrectionValue(value: unknown): boolean {
    if (value === undefined || value === null) {
        return true;
    }
    if (typeof value === "boolean" || typeof value === "string") {
        return true;
    }
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(isSerializableCorrectionValue);
    }
    if (!isPlainRecord(value)) {
        return false;
    }
    if (isThreeRuntimeObjectLike(value)) {
        return false;
    }
    return Object.values(value).every(isSerializableCorrectionValue);
}

function parseCanonicalOutput(value: unknown): boolean {
    return parseCanonicalUpperBodyState(value).ok;
}

function parseTemporalOutput(value: unknown): boolean {
    return parseTemporalUpperBodyState(value).ok;
}

function parseIntentOutput(value: unknown): boolean {
    return parseMotionIntentState(value).ok;
}

const correctionValueSchema = z.custom<unknown>(isSerializableCorrectionValue, {
    message: "Expected a JSON-serializable plain value.",
});

const motionPostProcessingCorrectionSchema: z.ZodType<MotionPostProcessingCorrection> =
    plainObjectSchema({
        target: z.enum(MOTION_POST_PROCESSING_TARGET_VALUES),
        path: z.string(),
        kind: z.enum(MOTION_POST_PROCESSING_CORRECTION_KIND_VALUES),
        confidence: confidenceSchema,
        reasonCode: z.enum(MOTION_POST_PROCESSING_REASON_CODE_VALUES),
        previousValue: correctionValueSchema.optional(),
        nextValue: correctionValueSchema.optional(),
    });

const motionPostProcessingResultSchema: z.ZodType<MotionPostProcessingResult> = plainObjectSchema({
    schemaVersion: z.literal(MOTION_POST_PROCESSING_SCHEMA_VERSION),
    timestamp: plainObjectSchema({
        mediaTimeMs: finiteNumberSchema,
    }),
    processor: plainObjectSchema({
        id: z.string(),
        version: z.string(),
        mode: z.enum(MOTION_POST_PROCESSING_MODE_VALUES),
    }),
    inputAvailability: plainObjectSchema({
        canonical: z.boolean(),
        temporal: z.boolean(),
        intent: z.boolean(),
        reliability: z.boolean(),
    }),
    output: plainObjectSchema({
        canonical: z.custom<CanonicalUpperBodyState>(parseCanonicalOutput).optional(),
        temporal: z.custom<TemporalUpperBodyState>(parseTemporalOutput).optional(),
        intent: z.custom<MotionIntentState>(parseIntentOutput).optional(),
    }),
    corrections: z.array(motionPostProcessingCorrectionSchema),
    warnings: z.array(z.enum(MOTION_POST_PROCESSING_WARNING_VALUES)),
});

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

function zodPathToStrings(path: readonly PropertyKey[]): string[] {
    return path.map((segment) => String(segment));
}

function classifyIssue(issue: z.core.$ZodIssue): MotionPostProcessingParseErrorCode {
    if (
        (issue.code === "too_small" || issue.code === "too_big") &&
        "origin" in issue &&
        issue.origin === "number"
    ) {
        return "out_of_range";
    }
    return "invalid_state";
}

export function parseMotionPostProcessingResult(value: unknown): MotionPostProcessingParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== MOTION_POST_PROCESSING_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Motion post-processing schemaVersion is not supported.",
                },
            ],
        };
    }

    const parsed = motionPostProcessingResultSchema.safeParse(value);
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

    return { ok: true, result: parsed.data };
}

export function createNoopMotionPostProcessingResult(
    input: MotionPostProcessingInput,
): MotionPostProcessingResult {
    return {
        schemaVersion: MOTION_POST_PROCESSING_SCHEMA_VERSION,
        timestamp: { mediaTimeMs: input.mediaTimeMs },
        processor: {
            id: "noop",
            version: "v1",
            mode: "disabled",
        },
        inputAvailability: {
            canonical: input.canonical !== undefined,
            temporal: input.temporal !== undefined,
            intent: input.intent !== undefined,
            reliability: input.reliability !== undefined,
        },
        output: {},
        corrections: [],
        warnings: ["processor_disabled"],
    };
}
