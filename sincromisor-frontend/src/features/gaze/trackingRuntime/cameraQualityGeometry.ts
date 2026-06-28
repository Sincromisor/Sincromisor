/**
 * CameraQualityScore 用に pose snapshot の画面内配置を評価する純粋計算を集約する。
 * 座標は full-frame normalized image coordinate として読み、境界 margin の調整時は tracking design の camera quality component と motion-debug 表示を確認する。
 */
import type {
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../poseTracking/sincroPoseMotionSnapshot";
import { CAMERA_QUALITY_BORDER_MARGIN_WARN } from "./cameraQualityScoreTypes";

export type CameraQualityPointGroup = {
    torso: SincroPoseTargetPointSnapshot[];
    hands: SincroPoseTargetPointSnapshot[];
};

type PointEvaluationReason = "missing" | "outside" | "near" | "inside";

export type CameraQualityPointEvaluation = {
    reason: PointEvaluationReason;
    borderDistance?: number;
};

export function posePointGroups(pose: SincroPoseMotionSnapshot): CameraQualityPointGroup {
    return {
        torso: [
            pose.leftArm.targets.shoulder,
            pose.rightArm.targets.shoulder,
            pose.lowerBodyTargets.leftHip,
            pose.lowerBodyTargets.rightHip,
        ],
        hands: [
            pose.leftArm.targets.elbow,
            pose.leftArm.targets.wrist,
            pose.rightArm.targets.elbow,
            pose.rightArm.targets.wrist,
        ],
    };
}

export function evaluateCameraQualityPoint(
    point: SincroPoseTargetPointSnapshot,
): CameraQualityPointEvaluation {
    if (
        !point.tracked ||
        !point.hasFiniteCoordinates ||
        !isFiniteNumber(point.cameraX) ||
        !isFiniteNumber(point.cameraY)
    ) {
        return { reason: "missing" };
    }
    if (point.cameraX < 0 || point.cameraX > 1 || point.cameraY < 0 || point.cameraY > 1) {
        return { reason: "outside", borderDistance: 0 };
    }
    const borderDistance = Math.min(
        point.cameraX,
        1 - point.cameraX,
        point.cameraY,
        1 - point.cameraY,
    );
    if (borderDistance < CAMERA_QUALITY_BORDER_MARGIN_WARN) {
        return { reason: "near", borderDistance };
    }
    return { reason: "inside", borderDistance };
}

export function cameraPointDistance(
    a: SincroPoseTargetPointSnapshot,
    b: SincroPoseTargetPointSnapshot,
): number | undefined {
    const aEvaluation = evaluateCameraQualityPoint(a);
    const bEvaluation = evaluateCameraQualityPoint(b);
    if (
        aEvaluation.reason === "missing" ||
        aEvaluation.reason === "outside" ||
        bEvaluation.reason === "missing" ||
        bEvaluation.reason === "outside"
    ) {
        return undefined;
    }
    return Math.hypot(a.cameraX - b.cameraX, a.cameraY - b.cameraY);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
