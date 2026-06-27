import { z } from "zod";

export const TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION =
    "sincro.tracker-performance-profile.v1" as const;

export type TrackerRuntimePerformanceProfileId =
    | "high-end-desktop"
    | "standard-laptop"
    | "mobile-safari"
    | "debug";

export type TrackerRuntimePerformanceProfile = {
    schemaVersion: typeof TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION;
    id: TrackerRuntimePerformanceProfileId;
    requestedId?: string;
    camera: {
        idealWidth: number;
        idealHeight: number;
        idealFrameRate: number;
        maxFrameRate: number;
        facingMode: "user";
    };
    cadence: {
        faceFps: number;
        poseFps: number;
        handFps: number;
        faceRoiFps: number;
        gestureFps: number;
    };
    debugLog: {
        numericRingBufferFrames: number;
        captureFullDumpByDefault: boolean;
        overlayCaptureFps: number;
    };
    degradationBudget: {
        workerRoundTripWarnRatio: number;
        workerRoundTripOverBudgetRatio: number;
        roiBudgetRatio: number;
        consecutiveOverBudgetFrames: number;
        recoveryFrames: number;
    };
    warnings: string[];
};

export type TrackerRuntimePerformanceProfileResolverInput = {
    performanceProfileId?: string;
    performanceProfile?: unknown;
    defaultProfileId?: TrackerRuntimePerformanceProfileId;
};

export type TrackerRuntimePerformanceProfileResolveResult = {
    profile: TrackerRuntimePerformanceProfile;
    source: "default" | "id" | "custom-profile" | "fallback";
};

const DEFAULT_PROFILE_ID: TrackerRuntimePerformanceProfileId = "standard-laptop";
const UNKNOWN_PROFILE_WARNING = "unknown_profile_id_defaulted";
const INVALID_CUSTOM_PROFILE_WARNING = "invalid_custom_profile_defaulted";

const profileIdSchema = z.enum(["high-end-desktop", "standard-laptop", "mobile-safari", "debug"]);

const positiveFiniteNumberSchema = z.number().finite().positive();
const nonNegativeFiniteNumberSchema = z.number().finite().nonnegative();

const cameraSchema = z
    .object({
        idealWidth: positiveFiniteNumberSchema,
        idealHeight: positiveFiniteNumberSchema,
        idealFrameRate: positiveFiniteNumberSchema,
        maxFrameRate: positiveFiniteNumberSchema,
        facingMode: z.literal("user"),
    })
    .strict();

const cadenceSchema = z
    .object({
        faceFps: positiveFiniteNumberSchema,
        poseFps: positiveFiniteNumberSchema,
        handFps: positiveFiniteNumberSchema,
        faceRoiFps: positiveFiniteNumberSchema,
        gestureFps: positiveFiniteNumberSchema,
    })
    .strict();

const debugLogSchema = z
    .object({
        numericRingBufferFrames: z.number().int().positive(),
        captureFullDumpByDefault: z.boolean(),
        overlayCaptureFps: nonNegativeFiniteNumberSchema.max(1),
    })
    .strict();

const degradationBudgetSchema = z
    .object({
        workerRoundTripWarnRatio: positiveFiniteNumberSchema,
        workerRoundTripOverBudgetRatio: positiveFiniteNumberSchema,
        roiBudgetRatio: positiveFiniteNumberSchema,
        consecutiveOverBudgetFrames: z.number().int().positive(),
        recoveryFrames: z.number().int().positive(),
    })
    .strict();

const performanceProfileSchema = z
    .object({
        schemaVersion: z.literal(TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION),
        id: profileIdSchema,
        requestedId: z.string().optional(),
        camera: cameraSchema,
        cadence: cadenceSchema,
        debugLog: debugLogSchema,
        degradationBudget: degradationBudgetSchema,
        warnings: z.array(z.string()),
    })
    .strict();

const SHARED_DEGRADATION_BUDGET: TrackerRuntimePerformanceProfile["degradationBudget"] = {
    workerRoundTripWarnRatio: 0.9,
    workerRoundTripOverBudgetRatio: 1.25,
    roiBudgetRatio: 0.55,
    consecutiveOverBudgetFrames: 5,
    recoveryFrames: 30,
};

const PROFILE_DEFINITIONS: Record<
    TrackerRuntimePerformanceProfileId,
    TrackerRuntimePerformanceProfile
> = {
    "high-end-desktop": createProfile({
        id: "high-end-desktop",
        camera: { idealWidth: 1280, idealHeight: 720, idealFrameRate: 30, maxFrameRate: 30 },
        cadence: { faceFps: 15, poseFps: 12, handFps: 8, faceRoiFps: 10, gestureFps: 6 },
        numericRingBufferFrames: 600,
    }),
    "standard-laptop": createProfile({
        id: "standard-laptop",
        camera: { idealWidth: 960, idealHeight: 540, idealFrameRate: 24, maxFrameRate: 24 },
        cadence: { faceFps: 12, poseFps: 8, handFps: 4, faceRoiFps: 6, gestureFps: 3 },
        numericRingBufferFrames: 600,
    }),
    "mobile-safari": createProfile({
        id: "mobile-safari",
        camera: { idealWidth: 640, idealHeight: 480, idealFrameRate: 15, maxFrameRate: 15 },
        cadence: { faceFps: 8, poseFps: 4, handFps: 2, faceRoiFps: 3, gestureFps: 1 },
        numericRingBufferFrames: 600,
    }),
    debug: createProfile({
        id: "debug",
        camera: { idealWidth: 1280, idealHeight: 720, idealFrameRate: 30, maxFrameRate: 30 },
        cadence: { faceFps: 15, poseFps: 12, handFps: 4, faceRoiFps: 6, gestureFps: 2 },
        numericRingBufferFrames: 1800,
    }),
};

export function resolveTrackerRuntimePerformanceProfile(
    input?: TrackerRuntimePerformanceProfileResolverInput,
): TrackerRuntimePerformanceProfileResolveResult {
    if (input?.performanceProfile !== undefined) {
        const customProfile = performanceProfileSchema.safeParse(input.performanceProfile);
        if (customProfile.success) {
            return {
                profile: cloneProfile(customProfile.data, input.performanceProfileId),
                source: "custom-profile",
            };
        }
        return {
            profile: cloneProfile(
                PROFILE_DEFINITIONS[DEFAULT_PROFILE_ID],
                input.performanceProfileId,
                [INVALID_CUSTOM_PROFILE_WARNING],
            ),
            source: "fallback",
        };
    }

    const requestedId = input?.performanceProfileId;
    if (requestedId !== undefined) {
        if (isTrackerRuntimePerformanceProfileId(requestedId)) {
            return {
                profile: cloneProfile(PROFILE_DEFINITIONS[requestedId], requestedId),
                source: "id",
            };
        }
        return {
            profile: cloneProfile(PROFILE_DEFINITIONS[DEFAULT_PROFILE_ID], requestedId, [
                UNKNOWN_PROFILE_WARNING,
            ]),
            source: "fallback",
        };
    }

    const defaultProfileId = input?.defaultProfileId ?? DEFAULT_PROFILE_ID;
    return {
        profile: cloneProfile(PROFILE_DEFINITIONS[defaultProfileId]),
        source: "default",
    };
}

export function isTrackerRuntimePerformanceProfileId(
    value: string,
): value is TrackerRuntimePerformanceProfileId {
    return profileIdSchema.safeParse(value).success;
}

function createProfile(input: {
    id: TrackerRuntimePerformanceProfileId;
    camera: Omit<TrackerRuntimePerformanceProfile["camera"], "facingMode">;
    cadence: TrackerRuntimePerformanceProfile["cadence"];
    numericRingBufferFrames: number;
}): TrackerRuntimePerformanceProfile {
    return {
        schemaVersion: TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION,
        id: input.id,
        camera: {
            ...input.camera,
            facingMode: "user",
        },
        cadence: {
            ...input.cadence,
        },
        debugLog: {
            numericRingBufferFrames: input.numericRingBufferFrames,
            captureFullDumpByDefault: false,
            overlayCaptureFps: 1,
        },
        degradationBudget: {
            ...SHARED_DEGRADATION_BUDGET,
        },
        warnings: [],
    };
}

function cloneProfile(
    profile: TrackerRuntimePerformanceProfile,
    requestedId?: string,
    warnings: string[] = profile.warnings,
): TrackerRuntimePerformanceProfile {
    return {
        schemaVersion: profile.schemaVersion,
        id: profile.id,
        requestedId: requestedId ?? profile.requestedId,
        camera: {
            ...profile.camera,
        },
        cadence: {
            ...profile.cadence,
        },
        debugLog: {
            ...profile.debugLog,
        },
        degradationBudget: {
            ...profile.degradationBudget,
        },
        warnings: [...warnings],
    };
}
