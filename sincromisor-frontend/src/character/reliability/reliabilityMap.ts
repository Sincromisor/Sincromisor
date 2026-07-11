import { z } from "zod";

export const RELIABILITY_MAP_SCHEMA_VERSION = "sincro.reliability-map.v1" as const;

const RELIABILITY_PART_STATE_VALUES = [
    "tracked",
    "suspect",
    "predicted",
    "lost",
    "recovering",
] as const;

const RELIABILITY_SOURCE_VALUES = [
    "pose",
    "hand",
    "face",
    "gesture",
    "camera",
    "previous",
    "neutral",
    "mixed",
] as const;

const GESTURE_RELIABILITY_SOURCE_VALUES = [
    "gesture",
    "hand",
    "previous",
    "neutral",
    "mixed",
] as const;

const RELIABILITY_REASON_CODE_VALUES = [
    "no_observation",
    "not_available_in_pose_snapshot",
    "pose_not_detected",
    "fallback_snapshot",
    "model_presence_low",
    "model_visibility_low",
    "tracking_lost",
    "weak_tracking",
    "bad_border",
    "missing_world_coordinates",
    "bone_length_inconsistent",
    "body_scale_missing",
    "body_scale_jump",
    "temporal_jump",
    "invalid_dt",
    "unstable_observation",
    "side_inconsistent",
    "roi_missing",
    "roi_inconsistent",
    "camera_quality_missing",
    "camera_quality_bad",
] as const;

const RELIABILITY_WARNING_CODE_VALUES = [
    "no_observation",
    "not_available_in_pose_snapshot",
    "low_confidence",
    "tracking_lost",
    "near_border",
    "out_of_frame",
    "missing_world_coordinates",
    "bone_length_inconsistent",
    "body_scale_jump",
    "temporal_jump",
    "side_inconsistent",
    "roi_inconsistent",
    "camera_quality_low",
] as const;

const RELIABILITY_JOINT_NAME_VALUES = [
    "leftShoulder",
    "rightShoulder",
    "leftElbow",
    "rightElbow",
    "leftWrist",
    "rightWrist",
    "head",
    "leftHand",
    "rightHand",
] as const;

const RELIABILITY_PART_NAME_VALUES = [
    "torso",
    "head",
    "leftArm",
    "rightArm",
    "leftHand",
    "rightHand",
    "leftFinger",
    "rightFinger",
] as const;

export type ReliabilitySource = (typeof RELIABILITY_SOURCE_VALUES)[number];
type GestureReliabilitySource = (typeof GESTURE_RELIABILITY_SOURCE_VALUES)[number];
type GestureReliabilitySide = "left" | "right";
type ReliabilityJointName = (typeof RELIABILITY_JOINT_NAME_VALUES)[number];
type ReliabilityPartName = (typeof RELIABILITY_PART_NAME_VALUES)[number];

export type ReliabilityPartState = (typeof RELIABILITY_PART_STATE_VALUES)[number];

export type ReliabilityReasonCode = (typeof RELIABILITY_REASON_CODE_VALUES)[number];

export type ReliabilityWarningCode = (typeof RELIABILITY_WARNING_CODE_VALUES)[number];

type ReliabilityScoreComponent = {
    score: number;
    reasonCodes: ReliabilityReasonCode[];
};

type ReliabilityComponentSet = {
    modelPresence: ReliabilityScoreComponent;
    modelVisibility: ReliabilityScoreComponent;
    tracking: ReliabilityScoreComponent;
    border: ReliabilityScoreComponent;
    boneLength: ReliabilityScoreComponent;
    bodyScale: ReliabilityScoreComponent;
    temporal: ReliabilityScoreComponent;
    side: ReliabilityScoreComponent;
    roi: ReliabilityScoreComponent;
    cameraQuality: ReliabilityScoreComponent;
};

type GestureReliabilityComponentSet = Pick<
    ReliabilityComponentSet,
    "tracking" | "temporal" | "side" | "roi" | "cameraQuality"
>;

export type JointReliability = {
    state: ReliabilityPartState;
    finalWeight: number;
    source: ReliabilitySource;
    components: ReliabilityComponentSet;
    warnings: ReliabilityWarningCode[];
};

export type PartReliability = {
    state: ReliabilityPartState;
    finalWeight: number;
    source: ReliabilitySource;
    joints: ReliabilityJointName[];
    components: ReliabilityComponentSet;
    warnings: ReliabilityWarningCode[];
};

export type GestureReliability = {
    state: ReliabilityPartState;
    finalWeight: number;
    source: GestureReliabilitySource;
    /**
     * Gesture observation を受けた normalized side。
     *
     * `GestureIntentObservation.left/right` の key 由来であり、MediaPipe raw handedness object
     * や camera preview の見た目の左右ではない。旧 log の placeholder / pre-gesture-reliability
     * frame では欠損できる。
     */
    side?: GestureReliabilitySide;
    /**
     * Gesture Recognizer の top label を説明用に保存する。
     *
     * unknown label でも valid observation なら保持するが、MotionIntent の semantic intent enum
     * ではない。raw category list は replay raw slot の責務であり、この field には保存しない。
     */
    label?: string;
    confidence: number;
    stableDurationMs: number;
    /**
     * `stableDurationMs` を前回 frame から継続計算するための media time。
     *
     * caller 指定の `mediaTimeMs` を保存するだけで、runtime clock ではない。旧 log 互換のため
     * optional とし、欠損時は次 frame で stability を reset する。
     */
    lastUpdatedAtMs?: number;
    components: GestureReliabilityComponentSet;
    warnings: ReliabilityWarningCode[];
};

type ReliabilityCameraQualityStatus = "good" | "warn" | "bad" | "unknown";

type ReliabilityCameraSummary = {
    videoWidth: number;
    videoHeight: number;
    cameraQualityScore: number;
    cameraQualityStatus: ReliabilityCameraQualityStatus;
    reasonCodes: ReliabilityReasonCode[];
};

export type ReliabilityMap = {
    schemaVersion: typeof RELIABILITY_MAP_SCHEMA_VERSION;
    timestamp: {
        mediaTimeMs: number;
        poseLastUpdatedAtMs?: number;
    };
    camera: ReliabilityCameraSummary;
    joints: Record<ReliabilityJointName, JointReliability>;
    parts: Record<ReliabilityPartName, PartReliability>;
    gesture: GestureReliability;
    warnings: ReliabilityWarningCode[];
};

type ReliabilityMapParseErrorCode = "unknown_schema_version" | "invalid_state" | "out_of_range";

type ReliabilityMapParseError = {
    code: ReliabilityMapParseErrorCode;
    path: string[];
    message: string;
};

export type ReliabilityMapParseResult =
    | { ok: true; map: ReliabilityMap }
    | { ok: false; errors: ReliabilityMapParseError[] };

type PlainRecord = Record<string, unknown>;

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.nonnegative();
const scoreSchema = finiteNumberSchema.min(0).max(1);
const reliabilityPartStateSchema = z.enum(RELIABILITY_PART_STATE_VALUES);
const reliabilitySourceSchema = z.enum(RELIABILITY_SOURCE_VALUES);
const gestureReliabilitySourceSchema = z.enum(GESTURE_RELIABILITY_SOURCE_VALUES);
const gestureReliabilitySideSchema = z.enum(["left", "right"]);
const reliabilityReasonCodeSchema = z.enum(RELIABILITY_REASON_CODE_VALUES);
const reliabilityWarningCodeSchema = z.enum(RELIABILITY_WARNING_CODE_VALUES);
const reliabilityJointNameSchema = z.enum(RELIABILITY_JOINT_NAME_VALUES);

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

const reliabilityScoreComponentSchema: z.ZodType<ReliabilityScoreComponent> = plainObjectSchema({
    score: scoreSchema,
    reasonCodes: z.array(reliabilityReasonCodeSchema),
});

const reliabilityComponentSetSchema: z.ZodType<ReliabilityComponentSet> = plainObjectSchema({
    modelPresence: reliabilityScoreComponentSchema,
    modelVisibility: reliabilityScoreComponentSchema,
    tracking: reliabilityScoreComponentSchema,
    border: reliabilityScoreComponentSchema,
    boneLength: reliabilityScoreComponentSchema,
    bodyScale: reliabilityScoreComponentSchema,
    temporal: reliabilityScoreComponentSchema,
    side: reliabilityScoreComponentSchema,
    roi: reliabilityScoreComponentSchema,
    cameraQuality: reliabilityScoreComponentSchema,
});

const gestureReliabilityComponentSetSchema: z.ZodType<GestureReliabilityComponentSet> =
    plainObjectSchema({
        tracking: reliabilityScoreComponentSchema,
        temporal: reliabilityScoreComponentSchema,
        side: reliabilityScoreComponentSchema,
        roi: reliabilityScoreComponentSchema,
        cameraQuality: reliabilityScoreComponentSchema,
    });

const jointReliabilitySchema: z.ZodType<JointReliability> = plainObjectSchema({
    state: reliabilityPartStateSchema,
    finalWeight: scoreSchema,
    source: reliabilitySourceSchema,
    components: reliabilityComponentSetSchema,
    warnings: z.array(reliabilityWarningCodeSchema),
});

const partReliabilitySchema: z.ZodType<PartReliability> = plainObjectSchema({
    state: reliabilityPartStateSchema,
    finalWeight: scoreSchema,
    source: reliabilitySourceSchema,
    joints: z.array(reliabilityJointNameSchema),
    components: reliabilityComponentSetSchema,
    warnings: z.array(reliabilityWarningCodeSchema),
});

const gestureReliabilitySchema: z.ZodType<GestureReliability> = plainObjectSchema({
    state: reliabilityPartStateSchema,
    finalWeight: scoreSchema,
    source: gestureReliabilitySourceSchema,
    side: gestureReliabilitySideSchema.optional(),
    label: z.string().optional(),
    confidence: scoreSchema,
    stableDurationMs: nonNegativeFiniteNumberSchema,
    lastUpdatedAtMs: finiteNumberSchema.optional(),
    components: gestureReliabilityComponentSetSchema,
    warnings: z.array(reliabilityWarningCodeSchema),
});

const reliabilityCameraSummarySchema: z.ZodType<ReliabilityCameraSummary> = plainObjectSchema({
    videoWidth: nonNegativeFiniteNumberSchema,
    videoHeight: nonNegativeFiniteNumberSchema,
    cameraQualityScore: scoreSchema,
    cameraQualityStatus: z.enum(["good", "warn", "bad", "unknown"]),
    reasonCodes: z.array(reliabilityReasonCodeSchema),
});

const reliabilityJointsSchema = plainObjectSchema({
    leftShoulder: jointReliabilitySchema,
    rightShoulder: jointReliabilitySchema,
    leftElbow: jointReliabilitySchema,
    rightElbow: jointReliabilitySchema,
    leftWrist: jointReliabilitySchema,
    rightWrist: jointReliabilitySchema,
    head: jointReliabilitySchema,
    leftHand: jointReliabilitySchema,
    rightHand: jointReliabilitySchema,
});

const reliabilityPartsSchema = plainObjectSchema({
    torso: partReliabilitySchema,
    head: partReliabilitySchema,
    leftArm: partReliabilitySchema,
    rightArm: partReliabilitySchema,
    leftHand: partReliabilitySchema,
    rightHand: partReliabilitySchema,
    leftFinger: partReliabilitySchema,
    rightFinger: partReliabilitySchema,
});

const reliabilityMapSchema: z.ZodType<ReliabilityMap> = plainObjectSchema({
    schemaVersion: z.literal(RELIABILITY_MAP_SCHEMA_VERSION),
    timestamp: plainObjectSchema({
        mediaTimeMs: finiteNumberSchema,
        poseLastUpdatedAtMs: finiteNumberSchema.optional(),
    }),
    camera: reliabilityCameraSummarySchema,
    joints: reliabilityJointsSchema,
    parts: reliabilityPartsSchema,
    gesture: gestureReliabilitySchema,
    warnings: z.array(reliabilityWarningCodeSchema),
});

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

function createDefaultScoreComponent(): ReliabilityScoreComponent {
    return {
        score: 0,
        reasonCodes: ["no_observation"],
    };
}

function createDefaultComponents(): ReliabilityComponentSet {
    return {
        modelPresence: createDefaultScoreComponent(),
        modelVisibility: createDefaultScoreComponent(),
        tracking: createDefaultScoreComponent(),
        border: createDefaultScoreComponent(),
        boneLength: createDefaultScoreComponent(),
        bodyScale: createDefaultScoreComponent(),
        temporal: createDefaultScoreComponent(),
        side: createDefaultScoreComponent(),
        roi: createDefaultScoreComponent(),
        cameraQuality: createDefaultScoreComponent(),
    };
}

function createDefaultGestureComponents(): GestureReliabilityComponentSet {
    return {
        tracking: createDefaultScoreComponent(),
        temporal: createDefaultScoreComponent(),
        side: createDefaultScoreComponent(),
        roi: createDefaultScoreComponent(),
        cameraQuality: createDefaultScoreComponent(),
    };
}

function createDefaultJointReliability(): JointReliability {
    return {
        state: "lost",
        finalWeight: 0,
        source: "neutral",
        components: createDefaultComponents(),
        warnings: ["no_observation"],
    };
}

function createDefaultPartReliability(joints: ReliabilityJointName[]): PartReliability {
    return {
        state: "lost",
        finalWeight: 0,
        source: "neutral",
        joints,
        components: createDefaultComponents(),
        warnings: ["no_observation"],
    };
}

function zodPathToStrings(path: readonly PropertyKey[]): string[] {
    return path.map((segment) => String(segment));
}

function classifyIssue(issue: z.core.$ZodIssue): ReliabilityMapParseErrorCode {
    if (
        (issue.code === "too_small" || issue.code === "too_big") &&
        "origin" in issue &&
        issue.origin === "number"
    ) {
        return "out_of_range";
    }
    return "invalid_state";
}

export function parseReliabilityMap(value: unknown): ReliabilityMapParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== RELIABILITY_MAP_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Reliability map schemaVersion is not supported.",
                },
            ],
        };
    }

    const parsed = reliabilityMapSchema.safeParse(value);
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

    return { ok: true, map: parsed.data };
}

export function createDefaultReliabilityMap(mediaTimeMs: number): ReliabilityMap {
    return {
        schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs,
        },
        camera: {
            videoWidth: 0,
            videoHeight: 0,
            cameraQualityScore: 0,
            cameraQualityStatus: "unknown",
            reasonCodes: ["no_observation"],
        },
        joints: {
            leftShoulder: createDefaultJointReliability(),
            rightShoulder: createDefaultJointReliability(),
            leftElbow: createDefaultJointReliability(),
            rightElbow: createDefaultJointReliability(),
            leftWrist: createDefaultJointReliability(),
            rightWrist: createDefaultJointReliability(),
            head: createDefaultJointReliability(),
            leftHand: createDefaultJointReliability(),
            rightHand: createDefaultJointReliability(),
        },
        parts: {
            torso: createDefaultPartReliability(["leftShoulder", "rightShoulder"]),
            head: createDefaultPartReliability(["head"]),
            leftArm: createDefaultPartReliability(["leftShoulder", "leftElbow", "leftWrist"]),
            rightArm: createDefaultPartReliability(["rightShoulder", "rightElbow", "rightWrist"]),
            leftHand: createDefaultPartReliability(["leftWrist", "leftHand"]),
            rightHand: createDefaultPartReliability(["rightWrist", "rightHand"]),
            leftFinger: createDefaultPartReliability(["leftHand"]),
            rightFinger: createDefaultPartReliability(["rightHand"]),
        },
        gesture: {
            state: "lost",
            finalWeight: 0,
            source: "neutral",
            confidence: 0,
            stableDurationMs: 0,
            components: createDefaultGestureComponents(),
            warnings: ["no_observation"],
        },
        warnings: ["no_observation"],
    };
}
