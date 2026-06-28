import type {
    SincroHandMotionSnapshot,
    SincroHandSideSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { TemporalArmState } from "../temporal/temporalUpperBodyState";
import type {
    ArmSide,
    GestureIntentObservation,
    MotionIntentEstimatorInput,
    NormalizedEstimatorConfig,
} from "./motionIntentEstimatorTypes";

export function getHandForSide(
    hand: SincroHandMotionSnapshot | undefined,
    side: ArmSide,
): SincroHandSideSnapshot | undefined {
    return side === "left" ? hand?.leftHand : hand?.rightHand;
}

export function getGestureForSide(
    gesture: GestureIntentObservation | undefined,
    side: ArmSide,
): { label: string; confidence: number } | undefined {
    return side === "left" ? gesture?.left : gesture?.right;
}

export function hasSideInconsistentWarning(input: MotionIntentEstimatorInput): boolean {
    if (input.reliability?.warnings.includes("side_inconsistent") === true) {
        return true;
    }
    return (
        input.hand?.leftHand.warnings.includes("side_inconsistent") === true ||
        input.hand?.rightHand.warnings.includes("side_inconsistent") === true
    );
}

export function detectGlobalClapLike(
    input: MotionIntentEstimatorInput,
    config: NormalizedEstimatorConfig,
): boolean {
    const left = input.hand?.leftHand;
    const right = input.hand?.rightHand;
    if (
        left?.detected !== true ||
        right?.detected !== true ||
        left.fullFrameWrist === undefined ||
        right.fullFrameWrist === undefined
    ) {
        return false;
    }
    return (
        distance2d(left.fullFrameWrist, right.fullFrameWrist) <= config.thresholds.clapDistance2d &&
        hasOpposedXVelocity(input.temporal.arms.left, input.temporal.arms.right)
    );
}

export function detectGlobalGuarded(
    input: MotionIntentEstimatorInput,
    config: NormalizedEstimatorConfig,
    sideSwapSuspect: boolean,
): boolean {
    if (
        input.temporal.arms.left.classification === "crossed" ||
        input.temporal.arms.right.classification === "crossed" ||
        sideSwapSuspect
    ) {
        return true;
    }
    const leftWrist = input.hand?.leftHand.fullFrameWrist;
    const rightWrist = input.hand?.rightHand.fullFrameWrist;
    if (leftWrist === undefined || rightWrist === undefined) {
        return false;
    }
    return (
        distance2d(leftWrist, rightWrist) <= config.thresholds.guardedHandDistance2d &&
        (input.temporal.arms.left.forwardness >= 0.35 ||
            input.temporal.arms.right.forwardness >= 0.35)
    );
}

export function calculateTorsoConfidence(input: MotionIntentEstimatorInput): number {
    if (input.reliability?.parts.torso.finalWeight !== undefined) {
        return input.reliability.parts.torso.finalWeight;
    }
    return (input.temporal.arms.left.confidence + input.temporal.arms.right.confidence) / 2;
}

function distance2d(left: readonly [number, number], right: readonly [number, number]): number {
    const dx = left[0] - right[0];
    const dy = left[1] - right[1];
    return Math.hypot(dx, dy);
}

function hasOpposedXVelocity(left: TemporalArmState, right: TemporalArmState): boolean {
    const leftX = left.velocity.wrist?.[0] ?? 0;
    const rightX = right.velocity.wrist?.[0] ?? 0;
    return Math.abs(leftX) > 0 && Math.abs(rightX) > 0 && leftX * rightX < 0;
}
