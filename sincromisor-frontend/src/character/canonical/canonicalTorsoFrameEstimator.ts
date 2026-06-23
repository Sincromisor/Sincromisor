import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type {
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    average,
    clampConfidence,
    cross,
    dot,
    isFiniteNumber,
    isFiniteTuple,
    length,
    MIN_CANONICAL_VECTOR_LENGTH,
    normalize,
    normalizedOrNeutral,
    scale,
    subtract,
    tuple3,
} from "./canonicalTuple3Math";
import {
    type CanonicalCalibrationSnapshot,
    type CanonicalTorsoFrame,
    type CanonicalTuple3,
    type CanonicalUpperBodyState,
    type CanonicalWarningCode,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "./canonicalUpperBodyState";

export type CanonicalTorsoFrameInput = {
    pose: SincroPoseMotionSnapshot;
    face?: Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose">;
    previous?: Pick<CanonicalUpperBodyState, "torso" | "calibration">;
    calibration?: CanonicalCalibrationSnapshot;
    mediaTimeMs: number;
};

export type CanonicalTorsoFrameResult = {
    torso: CanonicalTorsoFrame;
    calibration: CanonicalCalibrationSnapshot;
};

const FACE_YAW_CONFIDENCE_MIN = 0.08;
const FALLBACK_CONFIDENCE_MAX = 0.45;

const NEUTRAL_BODY_RIGHT: CanonicalTuple3 = [1, 0, 0];
const NEUTRAL_BODY_UP: CanonicalTuple3 = [0, 1, 0];
const NEUTRAL_BODY_FRONT: CanonicalTuple3 = [0, 0, 1];
const NEUTRAL_SHOULDER_CENTER: CanonicalTuple3 = [0, 1, 0];

type WorldPoint = {
    position: CanonicalTuple3;
    confidence: number;
};

type ShoulderEstimate = {
    shoulderCenter: CanonicalTuple3;
    bodyRight: CanonicalTuple3;
    shoulderWidth: number;
    confidence: number;
    fromPose: boolean;
};

type HipEstimate = {
    hipCenter?: CanonicalTuple3;
    bodyUp: CanonicalTuple3;
    torsoScale: number;
    confidence: number;
    fromPose: boolean;
};

function readWorldPoint(target: SincroPoseTargetPointSnapshot): WorldPoint | undefined {
    const world = target.world;
    if (
        !world.hasWorldCoordinates ||
        !isFiniteNumber(world.normalizedX) ||
        !isFiniteNumber(world.normalizedY) ||
        !isFiniteNumber(world.normalizedZ)
    ) {
        return undefined;
    }

    return {
        position: tuple3(world.normalizedX, world.normalizedY, world.normalizedZ),
        confidence: clampConfidence(world.worldConfidence),
    };
}

function cloneCalibration(calibration: CanonicalCalibrationSnapshot): CanonicalCalibrationSnapshot {
    return {
        ...calibration,
        handBaseline: {
            left: { ...calibration.handBaseline.left },
            right: { ...calibration.handBaseline.right },
        },
    };
}

function estimateShoulders(
    pose: SincroPoseMotionSnapshot,
    previous: Pick<CanonicalUpperBodyState, "torso" | "calibration"> | undefined,
    calibration: CanonicalCalibrationSnapshot,
): ShoulderEstimate {
    const leftShoulder = readWorldPoint(pose.leftArm.targets.shoulder);
    const rightShoulder = readWorldPoint(pose.rightArm.targets.shoulder);
    if (leftShoulder !== undefined && rightShoulder !== undefined) {
        const shoulderDelta = subtract(rightShoulder.position, leftShoulder.position);
        const bodyRight = normalize(shoulderDelta);
        const shoulderWidth = length(shoulderDelta);
        if (bodyRight !== undefined && shoulderWidth >= MIN_CANONICAL_VECTOR_LENGTH) {
            return {
                shoulderCenter: average(leftShoulder.position, rightShoulder.position),
                bodyRight,
                shoulderWidth,
                confidence: Math.min(leftShoulder.confidence, rightShoulder.confidence),
                fromPose: true,
            };
        }
    }

    if (previous !== undefined && isFiniteTuple(previous.torso.shoulderCenter)) {
        return {
            shoulderCenter: previous.torso.shoulderCenter,
            bodyRight: normalizedOrNeutral(previous.torso.bodyRight, NEUTRAL_BODY_RIGHT),
            shoulderWidth: previous.torso.shoulderWidth,
            confidence: Math.min(previous.torso.confidence, FALLBACK_CONFIDENCE_MAX),
            fromPose: false,
        };
    }

    return {
        shoulderCenter: NEUTRAL_SHOULDER_CENTER,
        bodyRight: NEUTRAL_BODY_RIGHT,
        shoulderWidth: calibration.shoulderWidth,
        confidence: 0,
        fromPose: false,
    };
}

function estimateHips(
    pose: SincroPoseMotionSnapshot,
    shoulderCenter: CanonicalTuple3,
    previous: Pick<CanonicalUpperBodyState, "torso" | "calibration"> | undefined,
    calibration: CanonicalCalibrationSnapshot,
): HipEstimate {
    const leftHip = readWorldPoint(pose.lowerBodyTargets.leftHip);
    const rightHip = readWorldPoint(pose.lowerBodyTargets.rightHip);
    if (leftHip !== undefined && rightHip !== undefined) {
        const hipCenter = average(leftHip.position, rightHip.position);
        const shoulderToHip = subtract(shoulderCenter, hipCenter);
        const bodyUp = normalize(shoulderToHip);
        if (bodyUp !== undefined) {
            return {
                hipCenter,
                bodyUp,
                torsoScale: length(shoulderToHip),
                confidence: Math.min(leftHip.confidence, rightHip.confidence),
                fromPose: true,
            };
        }
    }

    const previousBodyUp = normalizedOrNeutral(previous?.torso.bodyUp, NEUTRAL_BODY_UP);
    const previousTorsoScale = previous?.calibration.torsoScale ?? previous?.torso.torsoScale;
    return {
        hipCenter: isFiniteTuple(previous?.torso.hipCenter) ? previous?.torso.hipCenter : undefined,
        bodyUp: previousBodyUp,
        torsoScale: previousTorsoScale ?? calibration.torsoScale,
        confidence: Math.min(
            previous?.torso.confidence ?? FALLBACK_CONFIDENCE_MAX,
            FALLBACK_CONFIDENCE_MAX,
        ),
        fromPose: false,
    };
}

function estimateYawRad(
    face: Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose"> | undefined,
    previous: Pick<CanonicalUpperBodyState, "torso" | "calibration"> | undefined,
    calibration: CanonicalCalibrationSnapshot,
): { yawRad: number; faceHint?: CanonicalTuple3 } {
    const faceYawRad =
        face?.detected === true &&
        face.confidence >= FACE_YAW_CONFIDENCE_MIN &&
        Number.isFinite(face.headPose.yawDeg)
            ? (face.headPose.yawDeg * Math.PI) / 180
            : undefined;
    const yawRad =
        faceYawRad ??
        previous?.torso.yawRad ??
        previous?.calibration.neutralYawRad ??
        calibration.neutralYawRad;
    const finiteYawRad = Number.isFinite(yawRad) ? yawRad : 0;

    if (faceYawRad === undefined || Math.abs(faceYawRad) > Math.PI / 2) {
        return { yawRad: finiteYawRad };
    }

    return {
        yawRad: finiteYawRad,
        faceHint:
            normalize(tuple3(Math.sin(faceYawRad), 0, Math.cos(faceYawRad))) ?? NEUTRAL_BODY_FRONT,
    };
}

function estimateBodyFront(
    bodyRight: CanonicalTuple3,
    bodyUp: CanonicalTuple3,
    yaw: { yawRad: number; faceHint?: CanonicalTuple3 },
    previous: Pick<CanonicalUpperBodyState, "torso" | "calibration"> | undefined,
): { bodyFront: CanonicalTuple3; rejectedFlip: boolean; usedFallback: boolean } {
    const candidate = normalize(cross(bodyRight, bodyUp));
    if (candidate === undefined) {
        return {
            bodyFront: normalizedOrNeutral(previous?.torso.bodyFront, NEUTRAL_BODY_FRONT),
            rejectedFlip: false,
            usedFallback: true,
        };
    }

    const previousBodyFront = previous?.torso.bodyFront;
    if (isFiniteTuple(previousBodyFront)) {
        const normalizedPrevious = normalizedOrNeutral(previousBodyFront, NEUTRAL_BODY_FRONT);
        if (dot(candidate, normalizedPrevious) < 0) {
            return { bodyFront: normalizedPrevious, rejectedFlip: true, usedFallback: true };
        }
        return { bodyFront: candidate, rejectedFlip: false, usedFallback: false };
    }

    const faceForwardHint = yaw.faceHint ?? NEUTRAL_BODY_FRONT;
    if (dot(candidate, faceForwardHint) < 0) {
        return { bodyFront: scale(candidate, -1), rejectedFlip: true, usedFallback: false };
    }
    return { bodyFront: candidate, rejectedFlip: false, usedFallback: false };
}

function pushWarning(warnings: CanonicalWarningCode[], warning: CanonicalWarningCode): void {
    if (!warnings.includes(warning)) {
        warnings.push(warning);
    }
}

export function estimateCanonicalTorsoFrame(
    input: CanonicalTorsoFrameInput,
): CanonicalTorsoFrameResult {
    const calibration = cloneCalibration(
        input.calibration ?? DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
    );
    const shoulders = estimateShoulders(input.pose, input.previous, calibration);
    const hips = estimateHips(input.pose, shoulders.shoulderCenter, input.previous, calibration);
    const yaw = estimateYawRad(input.face, input.previous, calibration);
    const bodyFront = estimateBodyFront(shoulders.bodyRight, hips.bodyUp, yaw, input.previous);
    const warnings: CanonicalWarningCode[] = [];

    if (!shoulders.fromPose || !hips.fromPose || input.pose.upperBody.hipCenterTracked === false) {
        pushWarning(warnings, "missing_world_coordinates");
    }
    if (!shoulders.fromPose) {
        pushWarning(warnings, "torso_frame_unreliable");
    }
    if (bodyFront.rejectedFlip) {
        pushWarning(warnings, "front_flip_rejected");
    }
    if (bodyFront.usedFallback) {
        pushWarning(warnings, "torso_frame_unreliable");
    }

    if (shoulders.fromPose) {
        calibration.shoulderWidth = shoulders.shoulderWidth;
    }

    const usedFallback = !shoulders.fromPose || !hips.fromPose || bodyFront.usedFallback;
    const confidence = usedFallback
        ? Math.min(shoulders.confidence, hips.confidence, FALLBACK_CONFIDENCE_MAX)
        : Math.min(shoulders.confidence, hips.confidence);
    const source = !shoulders.fromPose
        ? input.previous === undefined
            ? "neutral"
            : "previous"
        : hips.fromPose && !bodyFront.usedFallback
          ? "pose"
          : "mixed";

    return {
        torso: {
            coordinateSystem: "body_local",
            shoulderCenter: shoulders.shoulderCenter,
            hipCenter: hips.hipCenter,
            bodyRight: normalizedOrNeutral(shoulders.bodyRight, NEUTRAL_BODY_RIGHT),
            bodyUp: normalizedOrNeutral(hips.bodyUp, NEUTRAL_BODY_UP),
            bodyFront: normalizedOrNeutral(bodyFront.bodyFront, NEUTRAL_BODY_FRONT),
            shoulderWidth: shoulders.shoulderWidth,
            torsoScale: hips.torsoScale,
            yawRad: yaw.yawRad,
            confidence: clampConfidence(confidence),
            source,
            warnings,
            outOfRangeFields: [],
        },
        calibration,
    };
}
