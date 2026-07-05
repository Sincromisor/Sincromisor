/**
 * motion-debug snapshot viewer の互換 facade。
 *
 * 既存 import 元 `./motionDebugViewerModel` を維持しながら、catalog、layer resolver、solver、
 * metrics、status 変換の責務は専用 module に委譲する。
 */
import type {
    SincroMotionDebugFrame,
    SincroMotionDebugLogManifest,
} from "../../character/motionEvaluation/motionDebugLogSchema";
import type {
    MotionMetricComparison,
    MotionMetricKey,
    MotionMetricSummary,
} from "../../character/motionEvaluation/motionMetrics";
import { MOTION_DEBUG_LAYER_KEYS, MOTION_DEBUG_VIEWER_MODES } from "./motionDebugViewerCatalog";
import {
    resolveCameraValue,
    resolveCanonicalValue,
    resolveFinalPoseValue,
    resolveIntentValue,
    resolvePostProcessingValue,
    resolveReliabilityValue,
    resolveTemporalValue,
} from "./motionDebugViewerLayerResolvers";
import {
    createLayerSnapshot,
    createParsedLayerSnapshot,
    createSolverLayerSnapshot,
    hasRecordedValue,
} from "./motionDebugViewerLayerSnapshots";
import { createMetricsLayerSnapshot } from "./motionDebugViewerMetricsLayer";
import { resolveSolverValue } from "./motionDebugViewerSolverLayer";
import type {
    MotionDebugLayerKey,
    MotionDebugLayerSnapshot,
    MotionDebugReplayState,
    MotionDebugSnapshot,
    MotionDebugViewerMode,
    MotionDebugViewerSnapshot,
} from "./types";

export { MOTION_DEBUG_LAYER_KEYS, MOTION_DEBUG_VIEWER_MODES };

/**
 * viewer snapshot を作るための入力境界。
 *
 * replay frame がある場合は saved slot を優先し、無い layer は live snapshot または `not_recorded` に落とす。
 * `metricComparison` は optional で、summary 未計算の replay metrics JSON を表示する経路とは独立している。
 */
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

/**
 * motion-debug panel が表示する viewer model を作る。
 *
 * 入力の parser 失敗は throw せず layer status `invalid` に変換する。camera settings は frame metrics /
 * manifest / live camera の順に解決し、raw device label を再導入しない。副作用はない。
 */
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
        reliability: createParsedLayerSnapshot("reliability", resolveReliabilityValue(context)),
        canonical: createParsedLayerSnapshot("canonical", resolveCanonicalValue(context)),
        temporal: createParsedLayerSnapshot("temporal", resolveTemporalValue(context)),
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
