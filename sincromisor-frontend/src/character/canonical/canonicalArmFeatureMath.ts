import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { dot, length, subtract, tuple3 } from "./canonicalTuple3Math";
import type {
    CanonicalArmClassification,
    CanonicalOutOfRangeField,
    CanonicalTuple3,
    CanonicalUpperBodyState,
    CanonicalWarningCode,
} from "./canonicalUpperBodyState";
import { readCanonicalWorldPoint } from "./canonicalWorldPoint";

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
    const worldPoint = readCanonicalWorldPoint(target);
    return worldPoint === undefined
        ? { position: neutral, usedFallback: true }
        : { position: worldPoint, usedFallback: false };
}

export function toBodyLocal(
    point: CanonicalTuple3,
    torsoFrame: CanonicalUpperBodyState["torso"],
): CanonicalTuple3 {
    const offset = subtract(point, torsoFrame.shoulderCenter);
    return tuple3(
        dot(offset, torsoFrame.bodyRight) / Math.max(torsoFrame.shoulderWidth, MIN_ARM_LENGTH),
        dot(offset, torsoFrame.bodyUp) / Math.max(torsoFrame.shoulderWidth, MIN_ARM_LENGTH),
        dot(offset, torsoFrame.bodyFront) / Math.max(torsoFrame.shoulderWidth, MIN_ARM_LENGTH),
    );
}

export function calculateForwardness(options: {
    shoulderLocal: CanonicalTuple3;
    wristLocal: CanonicalTuple3;
    shoulderWidth: number;
    arm: SincroPoseArmMotionSnapshot;
}): number {
    const bodyLocalDirection = clamp01(options.wristLocal[2] - options.shoulderLocal[2]);
    const worldZ = forwardnessWorldZ(options.arm, options.shoulderWidth);
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

/** 画面の奥行き補助量もraw由来の同一単位で計算する。normalizedZのアンカーには依存しない。 */
function forwardnessWorldZ(
    arm: SincroPoseArmMotionSnapshot,
    shoulderWidth: number,
): number | undefined {
    const shoulder = readCanonicalWorldPoint(arm.targets.shoulder);
    const wrist = readCanonicalWorldPoint(arm.targets.wrist);
    if (shoulder === undefined || wrist === undefined || shoulderWidth <= MIN_ARM_LENGTH)
        return undefined;
    return clamp01(((wrist[2] - shoulder[2]) / shoulderWidth + 1) / 2);
}
