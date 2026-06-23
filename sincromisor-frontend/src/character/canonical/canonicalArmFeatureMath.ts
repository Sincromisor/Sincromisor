import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { dot, isFiniteNumber, length, subtract, tuple3 } from "./canonicalTuple3Math";
import type {
    CanonicalArmClassification,
    CanonicalOutOfRangeField,
    CanonicalTuple3,
    CanonicalUpperBodyState,
    CanonicalWarningCode,
} from "./canonicalUpperBodyState";

export const FALLBACK_CONFIDENCE_MAX = 0.45;
export const MIN_ARM_LENGTH = 0.0001;

const MIN_PROJECTION_ARM_LENGTH = 0.0001;
const DEFAULT_FORWARDNESS_WEIGHTS = {
    bodyLocalDirection: 0.55,
    worldZ: 0.25,
    projectionShortening: 0.2,
} as const;

export type CanonicalArmBodyPoint = {
    position: CanonicalTuple3;
    usedFallback: boolean;
};

export function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function clampConfidence(value: number): number {
    return clamp01(value);
}

export function clampRange(
    path: string,
    value: number,
    min: number,
    max: number,
    outOfRangeFields: CanonicalOutOfRangeField[],
): number {
    const finiteValue = Number.isFinite(value) ? value : 0;
    const clampedValue = Math.max(min, Math.min(max, finiteValue));
    if (finiteValue !== clampedValue) {
        outOfRangeFields.push({ path, value: finiteValue, min, max, clampedValue });
    }
    return clampedValue;
}

export function pushWarning(warnings: CanonicalWarningCode[], warning: CanonicalWarningCode): void {
    if (!warnings.includes(warning)) {
        warnings.push(warning);
    }
}

export function readBodyPoint(
    target: SincroPoseTargetPointSnapshot,
    neutral: CanonicalTuple3,
): CanonicalArmBodyPoint {
    const worldPoint = readWorldTuple(target, neutral[2]);
    if (worldPoint !== undefined) {
        return { position: worldPoint, usedFallback: false };
    }
    if (
        target.hasFiniteCoordinates &&
        isFiniteNumber(target.localX) &&
        isFiniteNumber(target.localY)
    ) {
        return {
            position: tuple3(
                target.localX,
                target.localY,
                isFiniteNumber(target.localZ) ? target.localZ : 0,
            ),
            usedFallback: true,
        };
    }
    return { position: neutral, usedFallback: true };
}

export function toBodyLocal(
    point: CanonicalTuple3,
    torsoFrame: CanonicalUpperBodyState["torso"],
): CanonicalTuple3 {
    const offset = subtract(point, torsoFrame.shoulderCenter);
    return tuple3(
        dot(offset, torsoFrame.bodyRight),
        dot(offset, torsoFrame.bodyUp),
        dot(offset, torsoFrame.bodyFront),
    );
}

export function calculateForwardness(options: {
    shoulderLocal: CanonicalTuple3;
    wristLocal: CanonicalTuple3;
    shoulderWidth: number;
    arm: SincroPoseArmMotionSnapshot;
}): number {
    const shoulderWidth = Math.max(options.shoulderWidth, 0.001);
    const bodyLocalDirection = clamp01(
        (options.wristLocal[2] - options.shoulderLocal[2]) / shoulderWidth,
    );
    const worldZ = forwardnessWorldZ(options.arm);
    const shortening = projectionShortening(options.arm);
    const weighted =
        bodyLocalDirection * DEFAULT_FORWARDNESS_WEIGHTS.bodyLocalDirection +
        (worldZ === undefined ? 0 : worldZ * DEFAULT_FORWARDNESS_WEIGHTS.worldZ) +
        (shortening === undefined
            ? 0
            : shortening * DEFAULT_FORWARDNESS_WEIGHTS.projectionShortening);
    const weightSum =
        DEFAULT_FORWARDNESS_WEIGHTS.bodyLocalDirection +
        (worldZ === undefined ? 0 : DEFAULT_FORWARDNESS_WEIGHTS.worldZ) +
        (shortening === undefined ? 0 : DEFAULT_FORWARDNESS_WEIGHTS.projectionShortening);
    return clamp01(weighted / weightSum);
}

export function angleBetween(a: CanonicalTuple3, b: CanonicalTuple3): number {
    const magnitude = length(a) * length(b);
    if (!Number.isFinite(magnitude) || magnitude <= MIN_ARM_LENGTH) {
        return 0;
    }
    const cosine = Math.max(-1, Math.min(1, dot(a, b) / magnitude));
    return Math.acos(cosine);
}

export function classifyArm(
    confidence: number,
    openness: number,
    forwardness: number,
): CanonicalArmClassification {
    if (confidence < 0.15) {
        return "unknown";
    }
    if (openness < -0.25) {
        return "crossed";
    }
    if (forwardness >= 0.62 && Math.abs(openness) < 0.35) {
        return "front";
    }
    if (Math.abs(openness) >= 0.45 && forwardness < 0.45) {
        return "side";
    }
    if (forwardness >= 0.35 && Math.abs(openness) >= 0.25) {
        return "diagonal";
    }
    return "unknown";
}

export function hasLostJoint(arm: SincroPoseArmMotionSnapshot): boolean {
    return (
        arm.targets.shoulder.quality === "lost" ||
        arm.targets.elbow.quality === "lost" ||
        arm.targets.wrist.quality === "lost"
    );
}

export function minWorldConfidence(arm: SincroPoseArmMotionSnapshot): number {
    return Math.min(
        clampConfidence(arm.targets.shoulder.world.worldConfidence),
        clampConfidence(arm.targets.elbow.world.worldConfidence),
        clampConfidence(arm.targets.wrist.world.worldConfidence),
    );
}

function readWorldTuple(
    target: SincroPoseTargetPointSnapshot,
    fallbackZ: number,
): CanonicalTuple3 | undefined {
    const world = target.world;
    if (!world.hasWorldCoordinates) {
        return undefined;
    }
    if (isFiniteNumber(world.normalizedX) && isFiniteNumber(world.normalizedY)) {
        return tuple3(
            world.normalizedX,
            world.normalizedY,
            isFiniteNumber(world.normalizedZ) ? world.normalizedZ : fallbackZ,
        );
    }
    return undefined;
}

function distance2d(
    a: SincroPoseTargetPointSnapshot,
    b: SincroPoseTargetPointSnapshot,
): number | undefined {
    if (!a.hasFiniteCoordinates || !b.hasFiniteCoordinates) {
        return undefined;
    }
    if (
        !Number.isFinite(a.cameraX) ||
        !Number.isFinite(a.cameraY) ||
        !Number.isFinite(b.cameraX) ||
        !Number.isFinite(b.cameraY)
    ) {
        return undefined;
    }
    return Math.hypot(a.cameraX - b.cameraX, a.cameraY - b.cameraY);
}

function projectionShortening(arm: SincroPoseArmMotionSnapshot): number | undefined {
    const shoulder = arm.targets.shoulder;
    const elbow = arm.targets.elbow;
    const wrist = arm.targets.wrist;
    const imageUpperArmLength = distance2d(shoulder, elbow);
    const imageLowerArmLength = distance2d(elbow, wrist);
    const imageReach = distance2d(shoulder, wrist);
    if (
        imageUpperArmLength === undefined ||
        imageLowerArmLength === undefined ||
        imageReach === undefined
    ) {
        return undefined;
    }
    const imageArmLength = imageUpperArmLength + imageLowerArmLength;
    if (imageArmLength <= MIN_PROJECTION_ARM_LENGTH) {
        return undefined;
    }
    return clamp01(1 - imageReach / imageArmLength);
}

function forwardnessWorldZ(arm: SincroPoseArmMotionSnapshot): number | undefined {
    const shoulderZ = arm.targets.shoulder.world.normalizedZ;
    const wristZ = arm.targets.wrist.world.normalizedZ;
    if (!isFiniteNumber(shoulderZ) || !isFiniteNumber(wristZ)) {
        return undefined;
    }
    return clamp01((wristZ - shoulderZ + 1) / 2);
}
