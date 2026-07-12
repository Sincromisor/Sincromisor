import { component, unavailableComponents } from "./poseReliabilityComponents";
import type {
    ReliabilityComponentSet,
    ReliabilityJointName,
    ReliabilityScoreComponent,
} from "./poseReliabilityTypes";
import type {
    JointReliability,
    PartReliability,
    ReliabilityMap,
    ReliabilityPartState,
    ReliabilityReasonCode,
    ReliabilitySource,
    ReliabilityWarningCode,
} from "./reliabilityMap";

const TRACKED_WEIGHT_THRESHOLD = 0.65;
const LOST_WEIGHT_THRESHOLD = 0.05;

export function createReliability(
    source: ReliabilitySource,
    components: ReliabilityComponentSet,
    forceLost: boolean,
): Omit<JointReliability, "joints"> {
    if (forceLost) {
        return {
            state: "lost",
            finalWeight: 0,
            source,
            components,
            warnings: warningsFromComponents(components),
        };
    }
    const provisionalWeight = geometricMean(Object.values(components).map((entry) => entry.score));
    const state = stateFromWeight(provisionalWeight);
    return {
        state,
        finalWeight: state === "lost" ? 0 : provisionalWeight,
        source,
        components,
        warnings: warningsFromComponents(components),
    };
}

export function createUnavailableJoint(): JointReliability {
    return {
        state: "lost",
        finalWeight: 0,
        source: "neutral",
        components: unavailableComponents(),
        warnings: ["not_available_in_pose_snapshot"],
    };
}

export function createUnavailablePart(joints: ReliabilityJointName[]): PartReliability {
    return {
        state: "lost",
        finalWeight: 0,
        source: "neutral",
        joints,
        components: unavailableComponents(),
        warnings: ["not_available_in_pose_snapshot"],
    };
}

export function createUnavailableGesture(
    cameraQuality: ReliabilityScoreComponent,
): ReliabilityMap["gesture"] {
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

export function warningsFromComponents(
    components: ReliabilityComponentSet,
): ReliabilityWarningCode[] {
    return uniqueWarnings(
        Object.values(components).flatMap((entry) =>
            entry.reasonCodes.map((reason) => warningFromReason(reason)),
        ),
    );
}

export function uniqueWarnings(warnings: ReliabilityWarningCode[]): ReliabilityWarningCode[] {
    return [...new Set(warnings)];
}

function stateFromWeight(weight: number): ReliabilityPartState {
    if (weight >= TRACKED_WEIGHT_THRESHOLD) {
        return "tracked";
    }
    if (weight >= LOST_WEIGHT_THRESHOLD) {
        return "suspect";
    }
    return "lost";
}

function warningFromReason(reason: ReliabilityReasonCode): ReliabilityWarningCode {
    switch (reason) {
        case "not_available_in_pose_snapshot":
            return "not_available_in_pose_snapshot";
        case "model_presence_low":
        case "model_visibility_low":
        case "weak_tracking":
            return "low_confidence";
        case "tracking_lost":
        case "pose_not_detected":
        case "fallback_snapshot":
            return "tracking_lost";
        case "bad_border":
            return "near_border";
        case "missing_world_coordinates":
            return "missing_world_coordinates";
        case "bone_length_inconsistent":
            return "bone_length_inconsistent";
        case "body_scale_jump":
            return "body_scale_jump";
        case "temporal_jump":
            return "temporal_jump";
        case "camera_quality_missing":
        case "camera_quality_bad":
            return "camera_quality_low";
        case "side_inconsistent":
            return "side_inconsistent";
        case "roi_inconsistent":
            return "roi_inconsistent";
        case "no_observation":
            return "no_observation";
        default:
            return "no_observation";
    }
}

function geometricMean(scores: number[]): number {
    return (
        scores.reduce((product, score) => product * Math.max(score, 0.001), 1) **
        (1 / scores.length)
    );
}
