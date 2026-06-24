import {
    type CanonicalUpperBodyState,
    parseCanonicalUpperBodyState,
} from "../../character/canonical/canonicalUpperBodyState";
import type {
    SincroMotionDebugFrame,
    SincroMotionDebugLogManifest,
} from "../../character/motionEvaluation/motionDebugLogSchema";
import type {
    MotionMetricComparison,
    MotionMetricKey,
    MotionMetricSummary,
} from "../../character/motionEvaluation/motionMetrics";
import type {
    CanonicalLayerParseError,
    MotionDebugLayerKey,
    MotionDebugLayerSnapshot,
    MotionDebugReplayState,
    MotionDebugSnapshot,
    MotionDebugViewerMode,
    MotionDebugViewerSnapshot,
} from "./types";

export const MOTION_DEBUG_LAYER_KEYS: MotionDebugLayerKey[] = [
    "camera",
    "mediapipe",
    "poseSnapshot",
    "reliability",
    "canonical",
    "temporal",
    "intent",
    "solver",
    "finalPose",
    "applied",
    "metrics",
];

export const MOTION_DEBUG_VIEWER_MODES: MotionDebugViewerMode[] = [
    "live",
    "recording",
    "replay",
    "metrics",
];

const LAYER_LABELS: Record<MotionDebugLayerKey, string> = {
    camera: "Camera",
    mediapipe: "MediaPipe raw",
    poseSnapshot: "Pose snapshot",
    reliability: "Reliability",
    canonical: "Canonical",
    temporal: "Temporal",
    intent: "Intent",
    solver: "Solver",
    finalPose: "Final pose",
    applied: "Applied",
    metrics: "Metrics",
};

const RESERVED_PHASE_1_LAYERS = new Set<MotionDebugLayerKey>([
    "mediapipe",
    "reliability",
    "canonical",
    "temporal",
    "intent",
    "finalPose",
    "applied",
]);

export type MotionDebugViewerContext = {
    mode: MotionDebugViewerMode;
    selectedLayer: MotionDebugLayerKey;
    liveSnapshot: Omit<MotionDebugSnapshot, "viewer">;
    replayState: MotionDebugReplayState;
    replayManifest?: SincroMotionDebugLogManifest;
    replayFrame?: SincroMotionDebugFrame;
    metrics?: MotionMetricSummary;
    metricComparison?: Partial<Record<MotionMetricKey, MotionMetricComparison>>;
};

export function createMotionDebugViewerSnapshot(
    context: MotionDebugViewerContext,
): MotionDebugViewerSnapshot {
    const layers = createLayerSnapshots(context);
    return {
        mode: context.mode,
        selectedLayer: context.selectedLayer,
        layers,
        recording: {
            status: context.liveSnapshot.recording.status,
            frameCount: context.liveSnapshot.recording.frameCount,
            durationMs: context.liveSnapshot.recording.durationMs,
            compression: context.liveSnapshot.recording.compression,
            compressionFallbackReason: context.liveSnapshot.recording.compressionFallbackReason,
            scrubbedCameraSettings: hasRecordedValue(resolveCameraValue(context)),
        },
        replay: {
            status: context.replayState.status,
            mode: context.replayState.mode,
            frameCount: context.replayState.frameCount,
            currentFrameIndex: context.replayState.currentFrameIndex,
            lastResult: context.replayState.lastResult,
        },
        metrics: context.metrics,
        metricComparison: context.metricComparison,
    };
}

function createLayerSnapshots(
    context: MotionDebugViewerContext,
): Record<MotionDebugLayerKey, MotionDebugLayerSnapshot> {
    return {
        camera: createLayerSnapshot("camera", resolveCameraValue(context), false),
        mediapipe: createLayerSnapshot("mediapipe", context.replayFrame?.mediapipe, true),
        poseSnapshot: createLayerSnapshot(
            "poseSnapshot",
            context.replayFrame?.poseSnapshot ?? context.liveSnapshot.pose,
            false,
        ),
        reliability: createLayerSnapshot("reliability", context.replayFrame?.reliability, true),
        canonical: createLayerSnapshot("canonical", resolveCanonicalValue(context), true),
        temporal: createLayerSnapshot("temporal", context.replayFrame?.temporal, true),
        intent: createLayerSnapshot("intent", context.replayFrame?.intent, true),
        solver: createLayerSnapshot(
            "solver",
            context.replayFrame?.solver ?? context.liveSnapshot.poseRetarget,
            false,
        ),
        finalPose: createLayerSnapshot("finalPose", context.replayFrame?.finalPose, true),
        applied: createLayerSnapshot("applied", context.replayFrame?.applied, true),
        metrics: createMetricsLayerSnapshot(context),
    };
}

function resolveCanonicalValue(
    context: MotionDebugViewerContext,
): CanonicalUpperBodyState | CanonicalLayerParseError | undefined {
    if (context.replayFrame?.canonical !== undefined) {
        return parseCanonicalLayerValue(context.replayFrame.canonical);
    }
    return context.liveSnapshot.canonical;
}

function parseCanonicalLayerValue(
    value: unknown,
): CanonicalUpperBodyState | CanonicalLayerParseError {
    const parsed = parseCanonicalUpperBodyState(value);
    if (parsed.ok) {
        return parsed.state;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function resolveCameraValue(context: MotionDebugViewerContext): unknown {
    const frameCameraQuality = resolveFrameCameraQuality(context.replayFrame);
    if (frameCameraQuality !== undefined) {
        return frameCameraQuality;
    }
    if (context.replayManifest !== undefined) {
        return context.replayManifest.camera;
    }
    if (context.liveSnapshot.camera.source === "none") {
        return undefined;
    }
    return context.liveSnapshot.camera;
}

function resolveFrameCameraQuality(frame: SincroMotionDebugFrame | undefined): unknown {
    if (!isRecord(frame?.metrics)) {
        return undefined;
    }
    return frame.metrics.cameraQuality;
}

function createLayerSnapshot(
    key: MotionDebugLayerKey,
    value: unknown,
    phase1Reserved: boolean,
): MotionDebugLayerSnapshot {
    if (hasRecordedValue(value)) {
        return {
            status: "available",
            label: LAYER_LABELS[key],
            value,
        };
    }
    return {
        status:
            phase1Reserved || RESERVED_PHASE_1_LAYERS.has(key) ? "not_implemented" : "not_recorded",
        label: LAYER_LABELS[key],
    };
}

function createMetricsLayerSnapshot(context: MotionDebugViewerContext): MotionDebugLayerSnapshot {
    const metrics = context.metrics;
    if (metrics === undefined || !hasRecordedValue(metrics.metrics)) {
        if (hasRecordedValue(context.replayFrame?.metrics)) {
            return {
                status: "available",
                label: LAYER_LABELS.metrics,
                value: context.replayFrame?.metrics,
            };
        }
        return {
            status: "not_calculated",
            label: LAYER_LABELS.metrics,
        };
    }
    return {
        status: "available",
        label: LAYER_LABELS.metrics,
        value: metrics,
    };
}

function hasRecordedValue(value: unknown): boolean {
    if (value === undefined) {
        return false;
    }
    if (!isRecord(value)) {
        return true;
    }
    return Object.keys(value).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
