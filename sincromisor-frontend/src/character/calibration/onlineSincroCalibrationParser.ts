import { z } from "zod";
import type { CanonicalCalibrationSnapshot } from "../canonical/canonicalUpperBodyState";
import { cloneOnlineSincroCalibrationState } from "./onlineSincroCalibrationSnapshots";
import {
    ONLINE_CALIBRATION_FREEZE_REASON_VALUES,
    type OnlineCalibrationCandidateSnapshot,
    type OnlineCalibrationCommittedSnapshot,
    type OnlineSincroCalibrationState,
    type OnlineSincroCalibrationStateParseError,
    type OnlineSincroCalibrationStateParseResult,
    SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
} from "./onlineSincroCalibrationTypes";

type PlainRecord = Record<string, unknown>;

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.nonnegative();
const freezeReasonSchema = z.enum(ONLINE_CALIBRATION_FREEZE_REASON_VALUES);

const calibrationHandSideSchema = plainObjectSchema({
    palmSize: nonNegativeFiniteNumberSchema,
    openSpread: nonNegativeFiniteNumberSchema,
});

const calibrationSnapshotShape = {
    id: z.string(),
    source: z.enum(["default", "initial", "online", "replay"]),
    neutralYawRad: finiteNumberSchema,
    shoulderWidth: nonNegativeFiniteNumberSchema,
    torsoScale: nonNegativeFiniteNumberSchema,
    handBaseline: plainObjectSchema({
        left: calibrationHandSideSchema,
        right: calibrationHandSideSchema,
    }),
    capturedAtMediaTimeMs: nonNegativeFiniteNumberSchema.optional(),
};

const calibrationSnapshotSchema: z.ZodType<CanonicalCalibrationSnapshot> = z
    .custom<PlainRecord>(isPlainRecord, { message: "Expected a plain object." })
    .pipe(z.object(calibrationSnapshotShape).strict());

const candidateSnapshotSchema: z.ZodType<OnlineCalibrationCandidateSnapshot> = z
    .custom<PlainRecord>(isPlainRecord, { message: "Expected a plain object." })
    .pipe(
        z
            .object({
                ...calibrationSnapshotShape,
                stableDurationMs: nonNegativeFiniteNumberSchema,
            })
            .strict(),
    );

const committedSnapshotSchema: z.ZodType<OnlineCalibrationCommittedSnapshot> = z
    .custom<PlainRecord>(isPlainRecord, { message: "Expected a plain object." })
    .pipe(
        z
            .object({
                ...calibrationSnapshotShape,
                updatedAtMediaTimeMs: nonNegativeFiniteNumberSchema,
            })
            .strict(),
    );

const onlineCalibrationStateSchema: z.ZodType<OnlineSincroCalibrationState> = z
    .custom<PlainRecord>(isPlainRecord, { message: "Expected a plain object." })
    .pipe(
        z
            .object({
                schemaVersion: z.literal(SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION),
                initial: calibrationSnapshotSchema,
                candidate: candidateSnapshotSchema.optional(),
                committed: committedSnapshotSchema.optional(),
                freezeReasons: z.array(freezeReasonSchema),
            })
            .strict(),
    );

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

export function parseOnlineSincroCalibrationState(
    value: unknown,
): OnlineSincroCalibrationStateParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Online calibration schemaVersion is not supported.",
                },
            ],
        };
    }

    const parsed = onlineCalibrationStateSchema.safeParse(value);
    if (!parsed.success) {
        return {
            ok: false,
            errors: parsed.error.issues.map((issue) => ({
                code: classifyIssue(issue),
                path: issue.path.map((segment) => String(segment)),
                message: issue.message,
            })),
        };
    }
    return { ok: true, state: cloneOnlineSincroCalibrationState(parsed.data) };
}

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

function classifyIssue(issue: z.core.$ZodIssue): OnlineSincroCalibrationStateParseError["code"] {
    if (
        (issue.code === "too_small" || issue.code === "too_big") &&
        "origin" in issue &&
        issue.origin === "number"
    ) {
        return "out_of_range";
    }
    return "invalid_state";
}
