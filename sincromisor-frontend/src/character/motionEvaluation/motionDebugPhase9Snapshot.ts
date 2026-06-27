import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { z } from "zod";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfile";
import {
    createFingerCurlPoseLayers,
    type FingerCurlPoseDebugSnapshot,
} from "../motionIntent/fingerCurlPoseLayer";
import {
    type ArmMotionIntent,
    type MotionIntentState,
    parseMotionIntentState,
} from "../motionIntent/motionIntentState";
import {
    createSemanticMotionPoseLayer,
    type SemanticMotionPoseLayerDebugSnapshot,
    type SemanticMotionPosePresetId,
} from "../motionIntent/semanticMotionPoseLayer";
import type { VrmPoseLayer } from "../vrmPose/vrmPoseTypes";

export const MOTION_DEBUG_PHASE9_SCHEMA_VERSION = "sincro.phase9-semantic-motion.v1" as const;

export type MotionDebugPhase9SemanticSnapshot = {
    schemaVersion: typeof MOTION_DEBUG_PHASE9_SCHEMA_VERSION;
    timestamp: { mediaTimeMs: number };
    intent: MotionIntentState;
    semantic: SemanticMotionPoseLayerDebugSnapshot;
    finger: {
        left?: FingerCurlPoseDebugSnapshot;
        right?: FingerCurlPoseDebugSnapshot;
    };
    layers: Array<{
        id: string;
        kind: "semantic";
        weight: number;
        ownedBones: VRMHumanBoneName[];
    }>;
    warnings: string[];
};

export type MotionDebugPhase9SnapshotParseError = {
    code: "unknown_schema_version" | "invalid_state" | "out_of_range";
    path: string[];
    message: string;
};

export type MotionDebugPhase9SnapshotParseResult =
    | { ok: true; snapshot: MotionDebugPhase9SemanticSnapshot }
    | { ok: false; errors: MotionDebugPhase9SnapshotParseError[] };

export type MotionDebugPhase9SnapshotInput = {
    intent: MotionIntentState;
    profile?: AvatarMotionProfile;
    hand?: SincroHandMotionSnapshot;
    previousFinger?: Partial<Record<"left" | "right", FingerCurlPoseDebugSnapshot>>;
};

type PlainRecord = Record<string, unknown>;

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.nonnegative();
const stringArraySchema = z.array(z.string());
const boneNameSchema = z.custom<VRMHumanBoneName>((value) => typeof value === "string", {
    message: "Expected a VRM human bone name.",
});
const armMotionIntentSchema = z.custom<ArmMotionIntent>((value) => typeof value === "string", {
    message: "Expected an arm motion intent.",
});
const semanticPresetIdSchema = z.custom<SemanticMotionPosePresetId | "none">(
    (value) => typeof value === "string",
    {
        message: "Expected a semantic motion preset id.",
    },
);

const layerSummarySchema = plainObjectSchema({
    id: z.string(),
    kind: z.literal("semantic"),
    weight: finiteNumberSchema,
    ownedBones: z.array(boneNameSchema),
});

const semanticDebugSchema: z.ZodType<SemanticMotionPoseLayerDebugSnapshot> = plainObjectSchema({
    schemaVersion: z.literal(MOTION_DEBUG_PHASE9_SCHEMA_VERSION),
    timestamp: plainObjectSchema({
        mediaTimeMs: nonNegativeFiniteNumberSchema,
    }),
    presets: z.array(
        plainObjectSchema({
            side: z.enum(["left", "right", "both"]),
            intent: armMotionIntentSchema,
            presetId: semanticPresetIdSchema,
            layerId: z.string().optional(),
            weights: plainObjectSchema({
                arm: finiteNumberSchema,
                wrist: finiteNumberSchema,
                fingers: finiteNumberSchema,
                layer: finiteNumberSchema,
            }),
            ownedBones: z.array(boneNameSchema),
            suppressedBones: z.array(boneNameSchema),
            warnings: stringArraySchema,
        }),
    ),
    warnings: stringArraySchema,
});

const fingerGroupSchema = plainObjectSchema({
    group: z.enum(["thumb", "index", "middle", "ringLittle"]),
    curl: finiteNumberSchema,
    source: z.enum(["hand", "openness", "intent", "previous", "default"]),
    warnings: stringArraySchema,
});

const fingerDebugSchema: z.ZodType<FingerCurlPoseDebugSnapshot> = plainObjectSchema({
    schemaVersion: z.literal("sincro.phase9-finger-curl-pose.v1"),
    side: z.enum(["left", "right"]),
    timestamp: plainObjectSchema({
        mediaTimeMs: nonNegativeFiniteNumberSchema,
    }),
    groups: z.array(fingerGroupSchema),
    ownedBones: z.array(boneNameSchema),
    warnings: stringArraySchema,
});

const phase9EnvelopeSchema = plainObjectSchema({
    schemaVersion: z.literal(MOTION_DEBUG_PHASE9_SCHEMA_VERSION),
    timestamp: plainObjectSchema({
        mediaTimeMs: nonNegativeFiniteNumberSchema,
    }),
    intent: z.unknown(),
    semantic: semanticDebugSchema,
    finger: plainObjectSchema({
        left: fingerDebugSchema.optional(),
        right: fingerDebugSchema.optional(),
    }),
    layers: z.array(layerSummarySchema),
    warnings: stringArraySchema,
});

const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

export function createMotionDebugPhase9SemanticSnapshot(
    input: MotionDebugPhase9SnapshotInput,
): MotionDebugPhase9SemanticSnapshot {
    const mediaTimeMs = input.intent.timestamp.mediaTimeMs;
    const warnings = new Set<string>();
    const semantic = createSemanticDebug(input.intent, input.profile, warnings);
    const finger = createFingerDebug(input, warnings);
    return {
        schemaVersion: MOTION_DEBUG_PHASE9_SCHEMA_VERSION,
        timestamp: { mediaTimeMs },
        intent: input.intent,
        semantic: semantic.debug,
        finger: finger.debug,
        layers: summarizeLayers([...semantic.layers, ...finger.layers]),
        warnings: uniqueWarnings([...warnings, ...semantic.debug.warnings, ...finger.warnings]),
    };
}

export function parseMotionDebugPhase9SemanticSnapshot(
    value: unknown,
): MotionDebugPhase9SnapshotParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== MOTION_DEBUG_PHASE9_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Motion debug Phase 9 snapshot schemaVersion is not supported.",
                },
            ],
        };
    }

    const envelope = phase9EnvelopeSchema.safeParse(value);
    if (!envelope.success) {
        return {
            ok: false,
            errors: envelope.error.issues.map((issue) => createZodError(issue, [])),
        };
    }

    const intent = parseMotionIntentState(envelope.data.intent);
    if (!intent.ok) {
        return {
            ok: false,
            errors: intent.errors.map((error) => ({
                code: error.code,
                path: ["intent", ...error.path],
                message: error.message,
            })),
        };
    }

    return {
        ok: true,
        snapshot: {
            schemaVersion: MOTION_DEBUG_PHASE9_SCHEMA_VERSION,
            timestamp: envelope.data.timestamp,
            intent: intent.state,
            semantic: envelope.data.semantic,
            finger: envelope.data.finger,
            layers: envelope.data.layers,
            warnings: [...envelope.data.warnings],
        },
    };
}

function createSemanticDebug(
    intent: MotionIntentState,
    profile: AvatarMotionProfile | undefined,
    warnings: Set<string>,
): { debug: SemanticMotionPoseLayerDebugSnapshot; layers: VrmPoseLayer[] } {
    if (profile === undefined) {
        warnings.add("avatar_profile_not_available");
        return {
            layers: [],
            debug: {
                schemaVersion: MOTION_DEBUG_PHASE9_SCHEMA_VERSION,
                timestamp: { mediaTimeMs: intent.timestamp.mediaTimeMs },
                presets: [],
                warnings: ["avatar_profile_not_available"],
            },
        };
    }
    return createSemanticMotionPoseLayer({ intent, profile });
}

function createFingerDebug(
    input: MotionDebugPhase9SnapshotInput,
    warnings: Set<string>,
): {
    debug: MotionDebugPhase9SemanticSnapshot["finger"];
    layers: VrmPoseLayer[];
    warnings: string[];
} {
    if (input.profile === undefined || input.hand === undefined) {
        const warning =
            input.profile === undefined ? "avatar_profile_not_available" : "hand_not_recorded";
        warnings.add(warning);
        return { debug: {}, layers: [], warnings: [warning] };
    }

    const result = createFingerCurlPoseLayers({
        hand: input.hand,
        intent: input.intent,
        profile: input.profile,
        mediaTimeMs: input.intent.timestamp.mediaTimeMs,
        previous: input.previousFinger,
    });
    const debug: MotionDebugPhase9SemanticSnapshot["finger"] = {};
    for (const snapshot of result.debug) {
        if (snapshot.side === "left") {
            debug.left = snapshot;
        } else {
            debug.right = snapshot;
        }
    }
    return {
        debug,
        layers: result.layers,
        warnings: result.debug.flatMap((snapshot) => snapshot.warnings),
    };
}

function summarizeLayers(
    layers: readonly VrmPoseLayer[],
): MotionDebugPhase9SemanticSnapshot["layers"] {
    return layers.map((layer) => ({
        id: layer.id,
        kind: "semantic",
        weight: layer.weight,
        ownedBones: [...layer.ownedBones],
    }));
}

function uniqueWarnings(warnings: readonly string[]): string[] {
    return [...new Set(warnings)];
}

function createZodError(
    issue: z.core.$ZodIssue,
    prefix: string[],
): MotionDebugPhase9SnapshotParseError {
    return {
        code: classifyIssue(issue),
        path: [...prefix, ...issue.path.map((segment) => String(segment))],
        message: issue.message,
    };
}

function classifyIssue(issue: z.core.$ZodIssue): MotionDebugPhase9SnapshotParseError["code"] {
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
