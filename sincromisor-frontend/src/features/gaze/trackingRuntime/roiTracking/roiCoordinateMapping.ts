import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../poseTracking/sincroPoseMotionSnapshot";
import type {
    SincroRoiObservation,
    SincroRoiPoint,
    SincroRoiRect,
    SincroRoiSide,
    SincroRoiSource,
    SincroRoiWarningCode,
} from "./roiTrackingTypes";

const MIN_ROI_SIZE = 0.08;
const DEFAULT_MISSING_ROI_SIZE = 0.24;
const MIN_HAND_ROI_SIZE = 0.16;
const MAX_HAND_ROI_SIZE = 0.42;
const HAND_ROI_WRIST_ELBOW_SCALE = 2.4;
const HAND_ROI_SHOULDER_SCALE = 1.15;
const HAND_ROI_FORWARD_SCALE = 0.15;
const MIN_FACE_ROI_SIZE = 0.18;
const MAX_FACE_ROI_SIZE = 0.46;
const FACE_ROI_SHOULDER_SCALE = 1.45;
const FACE_ROI_VERTICAL_OFFSET_SCALE = 0.9;
const CONSISTENCY_FULL_SCORE_DISTANCE = 0.04;
const CONSISTENCY_ZERO_SCORE_DISTANCE = 0.18;

export function createHandRoiFromPoseArm(input: {
    side: "left" | "right";
    arm: SincroPoseArmMotionSnapshot;
    shoulderWidth: number;
}): SincroRoiObservation {
    const wrist = input.arm.targets.wrist;
    const wristPoint = pointFromPoseTarget(wrist);
    if (wrist.quality === "lost" || wristPoint === undefined) {
        return createMissingObservation(input.side, ["roi_missing"]);
    }

    const elbow = input.arm.targets.elbow;
    const elbowPoint = pointFromPoseTarget(elbow);
    const hasElbow = elbowPoint !== undefined;
    const hasShoulderWidth = Number.isFinite(input.shoulderWidth) && input.shoulderWidth > 0;
    const size =
        hasElbow && hasShoulderWidth
            ? clamp(
                  Math.max(
                      HAND_ROI_WRIST_ELBOW_SCALE * distance(wristPoint, elbowPoint),
                      HAND_ROI_SHOULDER_SCALE * input.shoulderWidth,
                  ),
                  MIN_HAND_ROI_SIZE,
                  MAX_HAND_ROI_SIZE,
              )
            : DEFAULT_MISSING_ROI_SIZE;
    const direction = hasElbow ? normalizeVector(wristPoint, elbowPoint) : undefined;
    const center: SincroRoiPoint =
        direction === undefined
            ? wristPoint
            : [
                  wristPoint[0] + direction[0] * size * HAND_ROI_FORWARD_SCALE,
                  wristPoint[1] + direction[1] * size * HAND_ROI_FORWARD_SCALE,
              ];
    const warnings: SincroRoiWarningCode[] = [];
    if (wrist.quality === "weak") {
        warnings.push("low_pose_quality");
    }

    return validateRoiRect({
        side: input.side,
        source: "pose-wrist",
        centerX: center[0],
        centerY: center[1],
        width: size,
        height: size,
        confidence: Math.min(input.arm.confidence, wrist.confidence),
        referencePoint: wristPoint,
        warnings,
    });
}

export function createFaceRoiFromPose(input: {
    pose: SincroPoseMotionSnapshot;
}): SincroRoiObservation {
    const upperBody = input.pose.upperBody;
    const shoulderWidth = upperBody.shoulderWidth;
    const hasValidShoulders =
        input.pose.detected &&
        Number.isFinite(shoulderWidth) &&
        shoulderWidth > 0 &&
        Number.isFinite(upperBody.shoulderCenterX) &&
        Number.isFinite(upperBody.shoulderCenterY);
    if (!hasValidShoulders) {
        return createMissingObservation("face", [
            "roi_missing",
            input.pose.detected ? "invalid_pose_point" : "pose_not_detected",
        ]);
    }

    const size = clamp(
        shoulderWidth * FACE_ROI_SHOULDER_SCALE,
        MIN_FACE_ROI_SIZE,
        MAX_FACE_ROI_SIZE,
    );
    const center: SincroRoiPoint = [
        upperBody.shoulderCenterX,
        upperBody.shoulderCenterY - shoulderWidth * FACE_ROI_VERTICAL_OFFSET_SCALE,
    ];

    return validateRoiRect({
        side: "face",
        source: "pose-face",
        centerX: center[0],
        centerY: center[1],
        width: size,
        height: size,
        confidence: input.pose.confidence,
        referencePoint: center,
    });
}

export function validateRoiRect(input: {
    side: SincroRoiSide;
    source: SincroRoiSource;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    confidence: number;
    referencePoint?: SincroRoiPoint;
    warnings?: SincroRoiWarningCode[];
}): SincroRoiObservation {
    const warnings = uniqueWarnings(input.warnings ?? []);
    let centerX = input.centerX;
    let centerY = input.centerY;
    let width = input.width;
    let height = input.height;
    let confidence = input.confidence;
    let referencePoint = input.referencePoint;

    if (!areFiniteNumbers(centerX, centerY, width, height, confidence)) {
        addWarning(warnings, "invalid_pose_point");
        centerX = Number.isFinite(centerX) ? centerX : 0.5;
        centerY = Number.isFinite(centerY) ? centerY : 0.5;
        width = Number.isFinite(width) ? Math.max(width, 0) : 0;
        height = Number.isFinite(height) ? Math.max(height, 0) : 0;
        confidence = Number.isFinite(confidence) ? confidence : 0;
    }
    if (referencePoint !== undefined && !isFinitePoint(referencePoint)) {
        addWarning(warnings, "invalid_pose_point");
        referencePoint = undefined;
    }

    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const top = centerY - height / 2;
    const bottom = centerY + height / 2;
    const clippedLeft = clamp(left, 0, 1);
    const clippedRight = clamp(right, 0, 1);
    const clippedTop = clamp(top, 0, 1);
    const clippedBottom = clamp(bottom, 0, 1);
    const clamped =
        clippedLeft !== left ||
        clippedRight !== right ||
        clippedTop !== top ||
        clippedBottom !== bottom;
    if (clamped) {
        addWarning(warnings, "roi_clamped");
    }

    const normalizedLeft = Math.min(clippedLeft, clippedRight);
    const normalizedRight = Math.max(clippedLeft, clippedRight);
    const normalizedTop = Math.min(clippedTop, clippedBottom);
    const normalizedBottom = Math.max(clippedTop, clippedBottom);
    const clippedWidth = normalizedRight - normalizedLeft;
    const clippedHeight = normalizedBottom - normalizedTop;
    if (clippedWidth < MIN_ROI_SIZE || clippedHeight < MIN_ROI_SIZE) {
        addWarning(warnings, "roi_too_small");
        confidence = 0;
    }

    return {
        side: input.side,
        source: input.source,
        rect: {
            centerX: (normalizedLeft + normalizedRight) / 2,
            centerY: (normalizedTop + normalizedBottom) / 2,
            width: clippedWidth,
            height: clippedHeight,
            clamped,
        },
        confidence: clamp(confidence, 0, 1),
        referencePoint,
        warnings,
    };
}

export function mapCropPointToFullFrame(roi: SincroRoiRect, point: SincroRoiPoint): SincroRoiPoint {
    return [
        roi.centerX - roi.width / 2 + point[0] * roi.width,
        roi.centerY - roi.height / 2 + point[1] * roi.height,
    ];
}

export function mapFullFramePointToCrop(roi: SincroRoiRect, point: SincroRoiPoint): SincroRoiPoint {
    return [
        (point[0] - (roi.centerX - roi.width / 2)) / roi.width,
        (point[1] - (roi.centerY - roi.height / 2)) / roi.height,
    ];
}

export function calculateRoiConsistency(input: {
    expected: SincroRoiPoint | undefined;
    observed: SincroRoiPoint | undefined;
}): { score: number; distance: number | null; warnings: SincroRoiWarningCode[] } {
    if (input.expected === undefined || input.observed === undefined) {
        return { score: 0, distance: null, warnings: ["roi_missing"] };
    }
    const distanceValue = distance(input.expected, input.observed);
    if (distanceValue <= CONSISTENCY_FULL_SCORE_DISTANCE) {
        return { score: 1, distance: distanceValue, warnings: [] };
    }
    if (distanceValue > CONSISTENCY_ZERO_SCORE_DISTANCE) {
        return { score: 0, distance: distanceValue, warnings: ["roi_inconsistent"] };
    }
    const score =
        1 -
        (distanceValue - CONSISTENCY_FULL_SCORE_DISTANCE) /
            (CONSISTENCY_ZERO_SCORE_DISTANCE - CONSISTENCY_FULL_SCORE_DISTANCE);
    return { score, distance: distanceValue, warnings: ["roi_inconsistent"] };
}

function createMissingObservation(
    side: SincroRoiSide,
    warnings: SincroRoiWarningCode[],
): SincroRoiObservation {
    return validateRoiRect({
        side,
        source: "none",
        centerX: 0.5,
        centerY: 0.5,
        width: DEFAULT_MISSING_ROI_SIZE,
        height: DEFAULT_MISSING_ROI_SIZE,
        confidence: 0,
        warnings,
    });
}

function pointFromPoseTarget(point: SincroPoseTargetPointSnapshot): SincroRoiPoint | undefined {
    if (!point.hasFiniteCoordinates || !areFiniteNumbers(point.cameraX, point.cameraY)) {
        return undefined;
    }
    return [point.cameraX, point.cameraY];
}

function normalizeVector(from: SincroRoiPoint, to: SincroRoiPoint): SincroRoiPoint | undefined {
    const dx = from[0] - to[0];
    const dy = from[1] - to[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) {
        return undefined;
    }
    return [dx / length, dy / length];
}

function distance(a: SincroRoiPoint, b: SincroRoiPoint): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function areFiniteNumbers(...values: number[]): boolean {
    return values.every((value) => Number.isFinite(value));
}

function isFinitePoint(point: SincroRoiPoint): boolean {
    return areFiniteNumbers(point[0], point[1]);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function uniqueWarnings(warnings: SincroRoiWarningCode[]): SincroRoiWarningCode[] {
    return warnings.filter((warning, index) => warnings.indexOf(warning) === index);
}

function addWarning(warnings: SincroRoiWarningCode[], warning: SincroRoiWarningCode): void {
    if (!warnings.includes(warning)) {
        warnings.push(warning);
    }
}
