import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { CanonicalTorsoFrameInput } from "./canonicalTorsoFrameEstimator";
import {
    cross,
    dot,
    isFiniteTuple,
    normalize,
    normalizedOrNeutral,
    scale,
    tuple3,
} from "./canonicalTuple3Math";
import type {
    CanonicalCalibrationSnapshot,
    CanonicalTuple3,
    CanonicalUpperBodyState,
} from "./canonicalUpperBodyState";

const FACE_YAW_CONFIDENCE_MIN = 0.08;
const NEUTRAL_BODY_RIGHT: CanonicalTuple3 = [1, 0, 0];
const NEUTRAL_BODY_UP: CanonicalTuple3 = [0, 1, 0];
const NEUTRAL_BODY_FRONT: CanonicalTuple3 = [0, 0, 1];

/** 顔が利用できる範囲だけ前後の判定補助とし、欠損時は既存の中立方位を保つ。 */
export function estimateYawRad(
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

/** 肩線と縦軸の外積から前方を求め、過去の基底と逆向きになる観測を拒否する。 */
export function estimateBodyFront(
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

/** 退化や腰欠損では基底全体を履歴へ戻し、新旧の軸を混ぜない。 */
export function previousBasis(previous: CanonicalTorsoFrameInput["previous"]) {
    const right = normalizedOrNeutral(previous?.torso.bodyRight, NEUTRAL_BODY_RIGHT);
    const up = normalizedOrNeutral(previous?.torso.bodyUp, NEUTRAL_BODY_UP);
    const front = normalizedOrNeutral(previous?.torso.bodyFront, NEUTRAL_BODY_FRONT);
    if (
        Math.abs(dot(right, up)) < 1e-6 &&
        Math.abs(dot(right, front)) < 1e-6 &&
        Math.abs(dot(up, front)) < 1e-6
    ) {
        return { bodyRight: right, bodyUp: up, bodyFront: front };
    }
    return {
        bodyRight: NEUTRAL_BODY_RIGHT,
        bodyUp: NEUTRAL_BODY_UP,
        bodyFront: NEUTRAL_BODY_FRONT,
    };
}
