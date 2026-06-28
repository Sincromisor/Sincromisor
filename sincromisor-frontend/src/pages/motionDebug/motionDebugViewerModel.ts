import {
    type CanonicalUpperBodyState,
    parseCanonicalUpperBodyState,
} from "../../character/canonical/canonicalUpperBodyState";
import type {
    SincroMotionDebugFrame,
    SincroMotionDebugLogManifest,
} from "../../character/motionEvaluation/motionDebugLogSchema";
import {
    type MotionDebugFinalPoseSnapshot,
    type MotionDebugPhase6SolverSnapshot,
    parseMotionDebugFinalPoseSnapshot,
    parseMotionDebugPhase6SolverSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase6Snapshot";
import {
    type MotionDebugPhase7Snapshot,
    parseMotionDebugPhase7Snapshot,
} from "../../character/motionEvaluation/motionDebugPhase7Snapshot";
import {
    type MotionDebugPhase9SemanticSnapshot,
    parseMotionDebugPhase9SemanticSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase9Snapshot";
import type {
    MotionMetricComparison,
    MotionMetricKey,
    MotionMetricSummary,
} from "../../character/motionEvaluation/motionMetrics";
import { parseReplayPoseSnapshot } from "../../character/motionEvaluation/motionReplayPoseSnapshotSchema";
import {
    type MotionIntentState,
    parseMotionIntentState,
} from "../../character/motionIntent/motionIntentState";
import {
    type MotionPostProcessingResult,
    parseMotionPostProcessingResult,
} from "../../character/motionPostProcessing/motionPostProcessingState";
import { createPoseReliabilityMap } from "../../character/reliability/poseReliabilityEstimator";
import {
    parseReliabilityMap,
    type ReliabilityMap,
} from "../../character/reliability/reliabilityMap";
import {
    parseTemporalUpperBodyState,
    type TemporalUpperBodyState,
} from "../../character/temporal/temporalUpperBodyState";
import { createMotionDebugLivePhase6SolverSnapshot } from "./motionDebugPhase6Snapshots";
import type {
    CanonicalLayerParseError,
    FinalPoseLayerParseError,
    MotionDebugLayerKey,
    MotionDebugLayerSnapshot,
    MotionDebugReplayState,
    MotionDebugSnapshot,
    MotionDebugViewerMode,
    MotionDebugViewerSnapshot,
    MotionIntentLayerParseError,
    MotionPostProcessingLayerParseError,
    ReliabilityLayerParseError,
    SolverLayerParseError,
    SolverLayerValue,
    TemporalLayerParseError,
} from "./types";

export const MOTION_DEBUG_LAYER_KEYS: MotionDebugLayerKey[] = [
    "camera",
    "mediapipe",
    "poseSnapshot",
    "reliability",
    "canonical",
    "temporal",
    "intent",
    "postProcessing",
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
    postProcessing: "Post-processing",
    solver: "Solver",
    finalPose: "Final pose",
    applied: "Applied",
    metrics: "Metrics",
};

const RESERVED_PHASE_1_LAYERS = new Set<MotionDebugLayerKey>(["mediapipe", "canonical", "applied"]);

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
        reliability: createLayerSnapshot("reliability", resolveReliabilityValue(context), false),
        canonical: createLayerSnapshot("canonical", resolveCanonicalValue(context), true),
        temporal: createLayerSnapshot("temporal", resolveTemporalValue(context), false),
        intent: createParsedLayerSnapshot("intent", resolveIntentValue(context)),
        postProcessing: createParsedLayerSnapshot(
            "postProcessing",
            resolvePostProcessingValue(context),
        ),
        solver: createSolverLayerSnapshot(resolveSolverValue(context)),
        finalPose: createParsedLayerSnapshot("finalPose", resolveFinalPoseValue(context)),
        applied: createLayerSnapshot("applied", context.replayFrame?.applied, true),
        metrics: createMetricsLayerSnapshot(context),
    };
}

function resolveSolverValue(context: MotionDebugViewerContext): SolverLayerValue {
    if (context.replayFrame !== undefined) {
        return {
            phase6: parsePhase6SolverSubLayer(resolveReplayPhase6SolverValue(context.replayFrame)),
            phase7: parsePhase7SolverSubLayer(resolveReplayPhase7SolverValue(context.replayFrame)),
            phase9: parsePhase9SolverSubLayer(resolveReplayPhase9SolverValue(context.replayFrame)),
        };
    }
    return {
        phase6: createAvailableSolverSubLayer(
            createMotionDebugLivePhase6SolverSnapshot(context.liveSnapshot.poseRetargetRuntime),
        ),
        phase7: createAvailableSolverSubLayer(context.liveSnapshot.phase7),
        phase9: createAvailableSolverSubLayer(undefined),
    };
}

function resolveReplayPhase6SolverValue(frame: SincroMotionDebugFrame): unknown | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    return frame.solver.phase6;
}

function resolveReplayPhase7SolverValue(frame: SincroMotionDebugFrame): unknown | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    return frame.solver.phase7;
}

function resolveReplayPhase9SolverValue(frame: SincroMotionDebugFrame): unknown | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    return frame.solver.phase9;
}

function parsePhase6SolverSubLayer(value: unknown): SolverLayerValue["phase6"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    const parsed = parsePhase6SolverLayerValue(value);
    if (isSolverLayerParseError(parsed)) {
        return { status: "invalid", value: parsed };
    }
    return { status: "available", value: parsed };
}

function parsePhase7SolverSubLayer(value: unknown): SolverLayerValue["phase7"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    const parsed = parsePhase7SolverLayerValue(value);
    if (isSolverLayerParseError(parsed)) {
        return { status: "invalid", value: parsed };
    }
    return { status: "available", value: parsed };
}

function parsePhase9SolverSubLayer(value: unknown): SolverLayerValue["phase9"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    const parsed = parsePhase9SolverLayerValue(value);
    if (isSolverLayerParseError(parsed)) {
        return { status: "invalid", value: parsed };
    }
    return { status: "available", value: parsed };
}

function createAvailableSolverSubLayer(
    value:
        | MotionDebugPhase6SolverSnapshot
        | MotionDebugPhase7Snapshot
        | MotionDebugPhase9SemanticSnapshot
        | undefined,
): SolverLayerValue["phase6"] | SolverLayerValue["phase7"] | SolverLayerValue["phase9"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    return { status: "available", value };
}

function parsePhase6SolverLayerValue(
    value: unknown,
): MotionDebugPhase6SolverSnapshot | SolverLayerParseError {
    const parsed = parseMotionDebugPhase6SolverSnapshot(value);
    if (parsed.ok) {
        return parsed.snapshot;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function parsePhase7SolverLayerValue(
    value: unknown,
): MotionDebugPhase7Snapshot | SolverLayerParseError {
    const parsed = parseMotionDebugPhase7Snapshot(value);
    if (parsed.ok) {
        return parsed.snapshot;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function parsePhase9SolverLayerValue(
    value: unknown,
): MotionDebugPhase9SemanticSnapshot | SolverLayerParseError {
    const parsed = parseMotionDebugPhase9SemanticSnapshot(value);
    if (parsed.ok) {
        return parsed.snapshot;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function resolveFinalPoseValue(
    context: MotionDebugViewerContext,
): MotionDebugFinalPoseSnapshot | FinalPoseLayerParseError | undefined {
    if (context.replayFrame !== undefined) {
        if (context.replayFrame.finalPose === undefined) {
            return undefined;
        }
        return parseFinalPoseLayerValue(context.replayFrame.finalPose);
    }
    return context.liveSnapshot.finalPose;
}

function parseFinalPoseLayerValue(
    value: unknown,
): MotionDebugFinalPoseSnapshot | FinalPoseLayerParseError {
    const parsed = parseMotionDebugFinalPoseSnapshot(value);
    if (parsed.ok) {
        return parsed.snapshot;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function resolveReliabilityValue(
    context: MotionDebugViewerContext,
): ReliabilityMap | ReliabilityLayerParseError | undefined {
    if (context.liveSnapshot.reliability !== undefined) {
        return context.liveSnapshot.reliability;
    }
    const frame = context.replayFrame;
    if (frame === undefined) {
        return undefined;
    }
    if (frame.reliability !== undefined) {
        return parseReliabilityLayerValue(frame.reliability);
    }
    if (frame.poseSnapshot === undefined) {
        return undefined;
    }
    const pose = parseReplayPoseSnapshot(frame.poseSnapshot);
    if (pose === undefined) {
        return undefined;
    }
    return createPoseReliabilityMap({
        pose,
        mediaTimeMs: frame.timestamp.mediaTimeMs,
        video: frame.video,
    });
}

function parseReliabilityLayerValue(value: unknown): ReliabilityMap | ReliabilityLayerParseError {
    const parsed = parseReliabilityMap(value);
    if (parsed.ok) {
        return parsed.map;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
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

function resolveTemporalValue(
    context: MotionDebugViewerContext,
): TemporalUpperBodyState | TemporalLayerParseError | undefined {
    if (context.replayFrame !== undefined) {
        if (context.replayFrame.temporal === undefined) {
            return undefined;
        }
        return parseTemporalLayerValue(context.replayFrame.temporal);
    }
    return context.liveSnapshot.temporal;
}

function parseTemporalLayerValue(value: unknown): TemporalUpperBodyState | TemporalLayerParseError {
    const parsed = parseTemporalUpperBodyState(value);
    if (parsed.ok) {
        return parsed.state;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function resolveIntentValue(
    context: MotionDebugViewerContext,
): MotionDebugSnapshot["intent"] | MotionIntentLayerParseError | undefined {
    if (context.replayFrame !== undefined) {
        if (context.replayFrame.intent === undefined) {
            return undefined;
        }
        return parseIntentLayerValue(context.replayFrame.intent);
    }
    return context.liveSnapshot.intent;
}

function parseIntentLayerValue(value: unknown): MotionIntentState | MotionIntentLayerParseError {
    const parsed = parseMotionIntentState(value);
    if (parsed.ok) {
        return parsed.state;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function resolvePostProcessingValue(
    context: MotionDebugViewerContext,
): MotionPostProcessingResult | MotionPostProcessingLayerParseError | undefined {
    if (context.replayFrame !== undefined) {
        if (context.replayFrame.postProcessing === undefined) {
            return undefined;
        }
        return parsePostProcessingLayerValue(context.replayFrame.postProcessing);
    }
    return context.liveSnapshot.postProcessing;
}

function parsePostProcessingLayerValue(
    value: unknown,
): MotionPostProcessingResult | MotionPostProcessingLayerParseError {
    const parsed = parseMotionPostProcessingResult(value);
    if (parsed.ok) {
        return parsed.result;
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

function createParsedLayerSnapshot(
    key: MotionDebugLayerKey,
    value: unknown,
): MotionDebugLayerSnapshot {
    if (isInvalidLayerValue(value)) {
        return {
            status: "invalid",
            label: LAYER_LABELS[key],
            value,
        };
    }
    return createLayerSnapshot(key, value, false);
}

function createSolverLayerSnapshot(value: SolverLayerValue): MotionDebugLayerSnapshot {
    if (
        value.phase6.status === "not_recorded" &&
        value.phase7.status === "not_recorded" &&
        value.phase9.status === "not_recorded"
    ) {
        return {
            status: "not_recorded",
            label: LAYER_LABELS.solver,
        };
    }
    return {
        status: "available",
        label: LAYER_LABELS.solver,
        value,
    };
}

function createMetricsLayerSnapshot(context: MotionDebugViewerContext): MotionDebugLayerSnapshot {
    const metrics = context.metrics;
    if (metrics === undefined || !hasRecordedValue(metrics.metrics)) {
        if (hasRecordedValue(context.replayFrame?.metrics)) {
            return {
                status: "available",
                label: LAYER_LABELS.metrics,
                value: createReplayMetricsLayerValue(context),
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

function createReplayMetricsLayerValue(context: MotionDebugViewerContext): unknown {
    if (!isRecord(context.replayFrame?.metrics)) {
        return context.replayFrame?.metrics;
    }
    return {
        ...context.replayFrame.metrics,
        activePerformanceProfile: context.liveSnapshot.camera.performanceProfile,
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

function isInvalidLayerValue(value: unknown): boolean {
    return isRecord(value) && value.parseStatus === "invalid";
}

function isSolverLayerParseError(
    value:
        | MotionDebugPhase6SolverSnapshot
        | MotionDebugPhase7Snapshot
        | MotionDebugPhase9SemanticSnapshot
        | SolverLayerParseError,
): value is SolverLayerParseError {
    return isInvalidLayerValue(value);
}
