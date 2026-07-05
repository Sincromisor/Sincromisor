/**
 * motion-debug viewer の non-solver layer 値を live / replay から解決する。
 *
 * replay frame がある layer は保存済み slot を優先し、parser 失敗は throw せず parse error wrapper を
 * 返す。旧 log fallback と camera の privacy-sensitive な解決順はここに閉じ込める。
 */
import {
    type CanonicalUpperBodyState,
    parseCanonicalUpperBodyState,
} from "../../character/canonical/canonicalUpperBodyState";
import type { SincroMotionDebugFrame } from "../../character/motionEvaluation/motionDebugLogSchema";
import {
    type MotionDebugFinalPoseSnapshot,
    parseMotionDebugFinalPoseSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase6Snapshot";
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
import type { MotionDebugViewerContext } from "./motionDebugViewerModel";
import type {
    CanonicalLayerParseError,
    FinalPoseLayerParseError,
    MotionDebugSnapshot,
    MotionIntentLayerParseError,
    MotionPostProcessingLayerParseError,
    ReliabilityLayerParseError,
    TemporalLayerParseError,
} from "./types";

/**
 * camera layer の表示値を replay frame metrics、manifest、live camera の順で解決する。
 *
 * raw device label を含む可能性がある browser settings を優先的に復元しない。live source が `none` で
 * quality も無い場合は、camera 未使用として `undefined` を返す。
 */
export function resolveCameraValue(context: MotionDebugViewerContext): unknown {
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

/**
 * reliability layer の live / replay 値を解決する。
 *
 * 旧 log は reliability slot を持たないため、parse 可能な pose snapshot から再計算する。pose が無い、
 * または parse 不能な場合は replay 全体を失敗させず `undefined` を返して未記録扱いにする。
 */
export function resolveReliabilityValue(
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

/**
 * canonical layer は replay slot があれば保存値を strict parse し、無ければ live snapshot を使う。
 *
 * parse 失敗は caller が `invalid` layer として表示できる wrapper に変換し、例外や log load 失敗にはしない。
 */
export function resolveCanonicalValue(
    context: MotionDebugViewerContext,
): CanonicalUpperBodyState | CanonicalLayerParseError | undefined {
    if (context.replayFrame?.canonical !== undefined) {
        return parseCanonicalLayerValue(context.replayFrame.canonical);
    }
    return context.liveSnapshot.canonical;
}

/**
 * temporal layer は replay frame が選択されている間、live fallback を使わない。
 *
 * 古い log に temporal slot が無い場合は `undefined` を返し、viewer で `not_recorded` にする。
 */
export function resolveTemporalValue(
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

/**
 * intent layer は replay frame が選択されている間、保存済み intent だけを表示する。
 *
 * parser 失敗は invalid wrapper に変換し、live intent への fallback は行わない。
 */
export function resolveIntentValue(
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

/**
 * post-processing layer は replay frame が選択されている間、保存済み result だけを表示する。
 *
 * parser 失敗時に live result へ fallback すると recording の破損を隠すため、invalid wrapper を返す。
 */
export function resolvePostProcessingValue(
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

/**
 * final pose layer は replay frame が選択されている間、保存済み composer result だけを表示する。
 *
 * parser 失敗は finalPose layer の invalid status に落とし、solver layer の表示可否には影響させない。
 */
export function resolveFinalPoseValue(
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

function resolveFrameCameraQuality(frame: SincroMotionDebugFrame | undefined): unknown {
    if (!isRecord(frame?.metrics)) {
        return undefined;
    }
    return frame.metrics.cameraQuality;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
