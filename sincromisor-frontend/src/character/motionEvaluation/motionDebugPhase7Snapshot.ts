/**
 * Phase 7 avatar profile / calibration snapshot の作成と parser 境界。
 * profile / calibration の invalid slot は debug 表示の parse error に留め、recording 全体の replay 互換性は壊さない。
 */
import { z } from "zod";
import {
    type AvatarMotionProfile,
    cloneAvatarMotionProfile,
    parseAvatarMotionProfile,
} from "../avatarProfile/avatarMotionProfile";
import {
    type InitialSincroCalibrationSession,
    SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION,
} from "../calibration/initialSincroCalibration";
import { parseOnlineSincroCalibrationState } from "../calibration/onlineSincroCalibrationParser";
import { cloneOnlineSincroCalibrationState } from "../calibration/onlineSincroCalibrationSnapshots";
import type { OnlineSincroCalibrationState } from "../calibration/onlineSincroCalibrationTypes";
import type { CanonicalCalibrationSnapshot } from "../canonical/canonicalUpperBodyState";

export const MOTION_DEBUG_PHASE7_SCHEMA_VERSION = "sincro.phase7-profile-calibration.v1" as const;

const INITIAL_CALIBRATION_STATUSES = [
    "not_started",
    "ready",
    "ready_without_hands",
    "retry_recommended",
    "failed",
] as const;

const INITIAL_CALIBRATION_STEP_IDS = [
    "precheck",
    "neutral",
    "a_pose",
    "hand_open",
    "face_yaw_optional",
] as const;

const INITIAL_CALIBRATION_STEP_STATUSES = [
    "ready",
    "degraded",
    "retry",
    "failed",
    "skipped",
] as const;

const INITIAL_CALIBRATION_RETRY_REASONS = [
    "shoulders_out_of_frame",
    "face_not_front",
    "elbow_or_wrist_hidden",
    "hand_not_visible",
    "too_dark",
    "motion_blur",
    "low_reliability",
    "camera_unavailable",
] as const;

export type MotionDebugPhase7Snapshot = {
    schemaVersion: typeof MOTION_DEBUG_PHASE7_SCHEMA_VERSION;
    profile?: AvatarMotionProfile;
    initialCalibration?: InitialSincroCalibrationSession;
    onlineCalibration?: OnlineSincroCalibrationState;
    activeCanonicalCalibration?: CanonicalCalibrationSnapshot;
    warnings: string[];
};

export type MotionDebugPhase7SnapshotParseError = {
    code: "unknown_schema_version" | "invalid_state" | "out_of_range";
    path: string[];
    message: string;
};

export type MotionDebugPhase7SnapshotParseResult =
    | { ok: true; snapshot: MotionDebugPhase7Snapshot }
    | { ok: false; errors: MotionDebugPhase7SnapshotParseError[] };

export type MotionDebugPhase7SnapshotInput = {
    profile?: AvatarMotionProfile;
    initialCalibration?: InitialSincroCalibrationSession;
    onlineCalibration?: OnlineSincroCalibrationState;
    activeCanonicalCalibration?: CanonicalCalibrationSnapshot;
    warnings?: string[];
};

type PlainRecord = Record<string, unknown>;

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.nonnegative();
const stringArraySchema = z.array(z.string());

const calibrationHandSideSchema = plainObjectSchema({
    palmSize: nonNegativeFiniteNumberSchema,
    openSpread: nonNegativeFiniteNumberSchema,
});

const canonicalCalibrationSnapshotSchema: z.ZodType<CanonicalCalibrationSnapshot> =
    plainObjectSchema({
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
    });

const initialCalibrationStepResultSchema = plainObjectSchema({
    id: z.enum(INITIAL_CALIBRATION_STEP_IDS),
    status: z.enum(INITIAL_CALIBRATION_STEP_STATUSES),
    validDurationMs: nonNegativeFiniteNumberSchema,
    score: finiteNumberSchema.min(0).max(1),
    retryReasons: z.array(z.enum(INITIAL_CALIBRATION_RETRY_REASONS)),
    measurements: plainObjectSchema({
        neutralYawRad: finiteNumberSchema.optional(),
        shoulderWidth: nonNegativeFiniteNumberSchema.optional(),
        torsoScale: nonNegativeFiniteNumberSchema.optional(),
        handBaseline: plainObjectSchema({
            left: calibrationHandSideSchema,
            right: calibrationHandSideSchema,
        }).optional(),
    }),
    debug: z.record(z.string(), z.union([finiteNumberSchema, z.boolean(), z.string()])),
});

const initialCalibrationStepsSchema: z.ZodType<InitialSincroCalibrationSession["steps"]> =
    plainObjectSchema({
        precheck: initialCalibrationStepResultSchema.optional(),
        neutral: initialCalibrationStepResultSchema.optional(),
        a_pose: initialCalibrationStepResultSchema.optional(),
        hand_open: initialCalibrationStepResultSchema.optional(),
        face_yaw_optional: initialCalibrationStepResultSchema.optional(),
    });

const initialCalibrationSessionSchema: z.ZodType<InitialSincroCalibrationSession> =
    plainObjectSchema({
        schemaVersion: z.literal(SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION),
        status: z.enum(INITIAL_CALIBRATION_STATUSES),
        startedAtMediaTimeMs: nonNegativeFiniteNumberSchema,
        completedAtMediaTimeMs: nonNegativeFiniteNumberSchema.optional(),
        steps: initialCalibrationStepsSchema,
        userGuideMessages: stringArraySchema,
        debugReasons: z.array(z.enum(INITIAL_CALIBRATION_RETRY_REASONS)),
    });

const phase7EnvelopeSchema = plainObjectSchema({
    schemaVersion: z.literal(MOTION_DEBUG_PHASE7_SCHEMA_VERSION),
    profile: z.unknown().optional(),
    initialCalibration: z.unknown().optional(),
    onlineCalibration: z.unknown().optional(),
    activeCanonicalCalibration: z.unknown().optional(),
    warnings: stringArraySchema,
});

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

export function createMotionDebugPhase7Snapshot(
    input: MotionDebugPhase7SnapshotInput,
): MotionDebugPhase7Snapshot | undefined {
    if (
        input.profile === undefined &&
        input.initialCalibration === undefined &&
        input.onlineCalibration === undefined &&
        input.activeCanonicalCalibration === undefined &&
        (input.warnings?.length ?? 0) === 0
    ) {
        return undefined;
    }
    return {
        schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
        profile: input.profile === undefined ? undefined : cloneAvatarMotionProfile(input.profile),
        initialCalibration:
            input.initialCalibration === undefined
                ? undefined
                : cloneInitialCalibrationSession(input.initialCalibration),
        onlineCalibration:
            input.onlineCalibration === undefined
                ? undefined
                : cloneOnlineSincroCalibrationState(input.onlineCalibration),
        activeCanonicalCalibration:
            input.activeCanonicalCalibration === undefined
                ? undefined
                : cloneCanonicalCalibrationSnapshot(input.activeCanonicalCalibration),
        warnings: [...(input.warnings ?? [])],
    };
}

export function parseMotionDebugPhase7Snapshot(
    value: unknown,
): MotionDebugPhase7SnapshotParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== MOTION_DEBUG_PHASE7_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Motion debug Phase 7 snapshot schemaVersion is not supported.",
                },
            ],
        };
    }

    const envelope = phase7EnvelopeSchema.safeParse(value);
    if (!envelope.success) {
        return {
            ok: false,
            errors: envelope.error.issues.map((issue) => createZodError(issue, [])),
        };
    }

    const errors: MotionDebugPhase7SnapshotParseError[] = [];
    const profile = parseOptionalProfile(envelope.data.profile, errors);
    const initialCalibration = parseOptionalInitialCalibration(
        envelope.data.initialCalibration,
        errors,
    );
    const onlineCalibration = parseOptionalOnlineCalibration(
        envelope.data.onlineCalibration,
        errors,
    );
    const activeCanonicalCalibration = parseOptionalCanonicalCalibration(
        envelope.data.activeCanonicalCalibration,
        errors,
    );
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        snapshot: {
            schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
            profile,
            initialCalibration,
            onlineCalibration,
            activeCanonicalCalibration,
            warnings: [...envelope.data.warnings],
        },
    };
}

function parseOptionalProfile(
    value: unknown,
    errors: MotionDebugPhase7SnapshotParseError[],
): AvatarMotionProfile | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = parseAvatarMotionProfile(value);
    if (!parsed.ok) {
        errors.push(...parsed.errors.map((error) => prefixError(error, "profile")));
        return undefined;
    }
    return parsed.profile;
}

function parseOptionalInitialCalibration(
    value: unknown,
    errors: MotionDebugPhase7SnapshotParseError[],
): InitialSincroCalibrationSession | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = initialCalibrationSessionSchema.safeParse(value);
    if (!parsed.success) {
        errors.push(
            ...parsed.error.issues.map((issue) => createZodError(issue, ["initialCalibration"])),
        );
        return undefined;
    }
    return cloneInitialCalibrationSession(parsed.data);
}

function parseOptionalOnlineCalibration(
    value: unknown,
    errors: MotionDebugPhase7SnapshotParseError[],
): OnlineSincroCalibrationState | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = parseOnlineSincroCalibrationState(value);
    if (!parsed.ok) {
        errors.push(...parsed.errors.map((error) => prefixError(error, "onlineCalibration")));
        return undefined;
    }
    return parsed.state;
}

function parseOptionalCanonicalCalibration(
    value: unknown,
    errors: MotionDebugPhase7SnapshotParseError[],
): CanonicalCalibrationSnapshot | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = canonicalCalibrationSnapshotSchema.safeParse(value);
    if (!parsed.success) {
        errors.push(
            ...parsed.error.issues.map((issue) =>
                createZodError(issue, ["activeCanonicalCalibration"]),
            ),
        );
        return undefined;
    }
    return cloneCanonicalCalibrationSnapshot(parsed.data);
}

function cloneInitialCalibrationSession(
    session: InitialSincroCalibrationSession,
): InitialSincroCalibrationSession {
    return {
        schemaVersion: session.schemaVersion,
        status: session.status,
        startedAtMediaTimeMs: session.startedAtMediaTimeMs,
        completedAtMediaTimeMs: session.completedAtMediaTimeMs,
        steps: cloneInitialCalibrationSteps(session.steps),
        userGuideMessages: [...session.userGuideMessages],
        debugReasons: [...session.debugReasons],
    };
}

function cloneInitialCalibrationSteps(
    steps: InitialSincroCalibrationSession["steps"],
): InitialSincroCalibrationSession["steps"] {
    const cloned: InitialSincroCalibrationSession["steps"] = {};
    if (steps.precheck !== undefined) {
        cloned.precheck = cloneInitialCalibrationStep(steps.precheck);
    }
    if (steps.neutral !== undefined) {
        cloned.neutral = cloneInitialCalibrationStep(steps.neutral);
    }
    if (steps.a_pose !== undefined) {
        cloned.a_pose = cloneInitialCalibrationStep(steps.a_pose);
    }
    if (steps.hand_open !== undefined) {
        cloned.hand_open = cloneInitialCalibrationStep(steps.hand_open);
    }
    if (steps.face_yaw_optional !== undefined) {
        cloned.face_yaw_optional = cloneInitialCalibrationStep(steps.face_yaw_optional);
    }
    return cloned;
}

function cloneInitialCalibrationStep(
    step: NonNullable<InitialSincroCalibrationSession["steps"]["precheck"]>,
): NonNullable<InitialSincroCalibrationSession["steps"]["precheck"]> {
    return {
        id: step.id,
        status: step.status,
        validDurationMs: step.validDurationMs,
        score: step.score,
        retryReasons: [...step.retryReasons],
        measurements: {
            neutralYawRad: step.measurements.neutralYawRad,
            shoulderWidth: step.measurements.shoulderWidth,
            torsoScale: step.measurements.torsoScale,
            handBaseline:
                step.measurements.handBaseline === undefined
                    ? undefined
                    : cloneHandBaseline(step.measurements.handBaseline),
        },
        debug: { ...step.debug },
    };
}

function cloneCanonicalCalibrationSnapshot(
    snapshot: CanonicalCalibrationSnapshot,
): CanonicalCalibrationSnapshot {
    return {
        id: snapshot.id,
        source: snapshot.source,
        neutralYawRad: snapshot.neutralYawRad,
        shoulderWidth: snapshot.shoulderWidth,
        torsoScale: snapshot.torsoScale,
        handBaseline: cloneHandBaseline(snapshot.handBaseline),
        capturedAtMediaTimeMs: snapshot.capturedAtMediaTimeMs,
    };
}

function cloneHandBaseline(
    handBaseline: CanonicalCalibrationSnapshot["handBaseline"],
): CanonicalCalibrationSnapshot["handBaseline"] {
    return {
        left: { ...handBaseline.left },
        right: { ...handBaseline.right },
    };
}

function createZodError(
    issue: z.core.$ZodIssue,
    prefix: string[],
): MotionDebugPhase7SnapshotParseError {
    return {
        code: classifyIssue(issue),
        path: [...prefix, ...issue.path.map((segment) => String(segment))],
        message: issue.message,
    };
}

function prefixError(
    error: MotionDebugPhase7SnapshotParseError,
    prefix: string,
): MotionDebugPhase7SnapshotParseError {
    return {
        code: error.code,
        path: [prefix, ...error.path],
        message: error.message,
    };
}

function classifyIssue(issue: z.core.$ZodIssue): MotionDebugPhase7SnapshotParseError["code"] {
    if (
        (issue.code === "too_small" || issue.code === "too_big") &&
        "origin" in issue &&
        issue.origin === "number"
    ) {
        return "out_of_range";
    }
    return "invalid_state";
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
