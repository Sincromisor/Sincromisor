import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { GestureIntentObservation } from "../motionIntent/motionIntentEstimator";
import { component, evaluateCameraQuality, finiteOrZero } from "./poseReliabilityComponents";
import { uniqueWarnings } from "./poseReliabilityFactories";
import type { ReliabilityScoreComponent } from "./poseReliabilityTypes";
import type { GestureReliability, ReliabilityMap, ReliabilityReasonCode } from "./reliabilityMap";

type GestureSide = "left" | "right";

export type GestureReliabilityInput = {
    gesture?: GestureIntentObservation;
    hand?: SincroHandMotionSnapshot;
    previous?: ReliabilityMap["gesture"];
    cameraQuality?: CameraQualityScore;
    mediaTimeMs: number;
};

type GestureObservation = {
    side: GestureSide;
    label: string;
    confidence: number;
};

const GESTURE_STABLE_CONFIDENCE_THRESHOLD = 0.7;
const GESTURE_STABLE_CAP_MS = 160;
const MAX_GESTURE_DT_MS = 1000;
const SIDE_INCONSISTENT_SCORE = 0.35;

/**
 * Gesture optional pass の normalized observation から `ReliabilityMap.gesture` を作る。
 *
 * 入力は保存済み snapshot 由来の label / confidence と Hand snapshot、前回 gesture reliability、
 * caller 指定 `mediaTimeMs` に限定する。MediaPipe raw category list や handedness object は読まず、
 * unknown raw label でも observation が valid なら `source: "gesture"` として保存する。
 * semantic intent への昇格可否は MotionIntentEstimator の allow list が判断する。
 */
export function createGestureReliability(
    input: GestureReliabilityInput,
): ReliabilityMap["gesture"] {
    const cameraQuality = evaluateCameraQuality(input.cameraQuality);
    const observation = selectTopGestureObservation(input.gesture);
    if (observation === undefined) {
        return createNeutralGestureReliability(cameraQuality);
    }

    const components = {
        tracking: component(observation.confidence, []),
        temporal: component(0, ["no_observation"]),
        side: evaluateGestureSide(input.hand, observation.side),
        roi: evaluateGestureRoi(input.hand, observation.side),
        cameraQuality,
    };
    const stableDurationMs = calculateStableDurationMs(input, observation);
    const baseWeight = Math.min(
        components.tracking.score,
        components.side.score,
        components.roi.score,
        components.cameraQuality.score,
    );
    const cappedWeight =
        stableDurationMs < GESTURE_STABLE_CAP_MS ? Math.min(baseWeight, 0.5) : baseWeight;
    const finalWeight = clamp01(cappedWeight);

    return {
        state: stateFromWeight(finalWeight),
        finalWeight,
        source: "gesture",
        side: observation.side,
        label: observation.label,
        confidence: observation.confidence,
        stableDurationMs,
        lastUpdatedAtMs: finiteOrZero(input.mediaTimeMs),
        components,
        warnings: uniqueWarnings(
            Object.values(components).flatMap((entry) =>
                entry.reasonCodes.map((reason) => warningFromReason(reason)),
            ),
        ),
    };
}

function createNeutralGestureReliability(
    cameraQuality: ReliabilityScoreComponent,
): GestureReliability {
    return {
        state: "lost",
        finalWeight: 0,
        source: "neutral",
        confidence: 0,
        stableDurationMs: 0,
        components: {
            tracking: component(0, ["no_observation"]),
            temporal: component(0, ["no_observation"]),
            side: component(0, ["no_observation"]),
            roi: component(0, ["no_observation"]),
            cameraQuality,
        },
        warnings: ["no_observation"],
    };
}

function selectTopGestureObservation(
    gesture: GestureIntentObservation | undefined,
): GestureObservation | undefined {
    const observations: GestureObservation[] = [];
    if (gesture?.left !== undefined && gesture.left.label.length > 0) {
        observations.push({
            side: "left",
            label: gesture.left.label,
            confidence: clamp01(gesture.left.confidence),
        });
    }
    if (gesture?.right !== undefined && gesture.right.label.length > 0) {
        observations.push({
            side: "right",
            label: gesture.right.label,
            confidence: clamp01(gesture.right.confidence),
        });
    }
    return observations.sort((a, b) => b.confidence - a.confidence)[0];
}

function calculateStableDurationMs(
    input: GestureReliabilityInput,
    observation: GestureObservation,
): number {
    const previous = input.previous;
    if (
        previous === undefined ||
        previous.source !== "gesture" ||
        previous.side !== observation.side ||
        previous.label !== observation.label ||
        previous.lastUpdatedAtMs === undefined ||
        observation.confidence < GESTURE_STABLE_CONFIDENCE_THRESHOLD
    ) {
        return 0;
    }
    const dtMs = input.mediaTimeMs - previous.lastUpdatedAtMs;
    if (!Number.isFinite(dtMs) || dtMs <= 0) {
        return 0;
    }
    return previous.stableDurationMs + Math.min(MAX_GESTURE_DT_MS, dtMs);
}

function evaluateGestureSide(
    hand: SincroHandMotionSnapshot | undefined,
    side: GestureSide,
): ReliabilityScoreComponent {
    const handSide = side === "left" ? hand?.leftHand : hand?.rightHand;
    if (handSide === undefined || !handSide.detected) {
        return component(0, ["no_observation"]);
    }
    if (handSide.assignedSide !== side || handSide.warnings.includes("side_inconsistent")) {
        return component(SIDE_INCONSISTENT_SCORE, ["side_inconsistent"]);
    }
    return component(1, []);
}

function evaluateGestureRoi(
    hand: SincroHandMotionSnapshot | undefined,
    side: GestureSide,
): ReliabilityScoreComponent {
    const handSide = side === "left" ? hand?.leftHand : hand?.rightHand;
    if (handSide === undefined || !handSide.detected || handSide.roi === undefined) {
        return component(0, ["no_observation"]);
    }
    return component(handSide.roi.confidence, roiReasons(handSide.roi.warnings));
}

function roiReasons(warnings: readonly string[]): ReliabilityReasonCode[] {
    const reasons: ReliabilityReasonCode[] = [];
    for (const warning of warnings) {
        if (warning === "roi_missing") {
            reasons.push("roi_missing");
        }
        if (warning !== "roi_missing") {
            reasons.push("roi_inconsistent");
        }
    }
    return [...new Set(reasons)];
}

function stateFromWeight(weight: number): GestureReliability["state"] {
    if (weight >= 0.65) {
        return "tracked";
    }
    if (weight >= 0.05) {
        return "suspect";
    }
    return "lost";
}

function warningFromReason(reason: ReliabilityReasonCode): GestureReliability["warnings"][number] {
    switch (reason) {
        case "side_inconsistent":
            return "side_inconsistent";
        case "roi_inconsistent":
            return "roi_inconsistent";
        case "camera_quality_bad":
        case "camera_quality_missing":
            return "camera_quality_low";
        case "no_observation":
        case "roi_missing":
            return "no_observation";
        default:
            return "low_confidence";
    }
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, finiteOrZero(value)));
}
