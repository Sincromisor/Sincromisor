import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type {
    PoseReliabilityEstimatorInput,
    ReliabilityComponentSet,
    ReliabilityScoreComponent,
} from "./poseReliabilityTypes";
import type { ReliabilityReasonCode } from "./reliabilityMap";

const BORDER_BAD_MARGIN = 0.04;
const BORDER_GOOD_MARGIN = 0.16;
const BODY_RATIO_WARN = 1.35;
const BODY_RATIO_BAD = 1.8;
const BONE_RATIO_LOW_BAD = 0.35;
const BONE_RATIO_LOW_WARN = 0.55;
const BONE_RATIO_HIGH_WARN = 1.8;
const BONE_RATIO_HIGH_BAD = 2.4;
const TEMPORAL_SPEED_GOOD = 2;
const TEMPORAL_SPEED_BAD = 8;

export function evaluateModelScalar(
    pose: SincroPoseMotionSnapshot,
    value: number,
    reason: ReliabilityReasonCode,
): ReliabilityScoreComponent {
    if (!pose.detected) {
        return component(0, poseReasons(pose));
    }
    const score = clamp01(value);
    return component(score, score < 0.5 ? [reason] : []);
}

export function evaluateTargetTracking(
    pose: SincroPoseMotionSnapshot,
    point: SincroPoseTargetPointSnapshot,
): ReliabilityScoreComponent {
    if (!pose.detected) {
        return component(0, poseReasons(pose));
    }
    if (!point.tracked || point.quality === "lost") {
        return component(0, ["tracking_lost"]);
    }
    if (point.quality === "weak") {
        return component(0.45, ["weak_tracking"]);
    }
    return goodComponent();
}

export function evaluateBorder(point: SincroPoseTargetPointSnapshot): ReliabilityScoreComponent {
    if (!isFiniteNumber(point.cameraX) || !isFiniteNumber(point.cameraY)) {
        return component(0, ["bad_border"]);
    }
    if (point.cameraX < 0 || point.cameraX > 1 || point.cameraY < 0 || point.cameraY > 1) {
        return component(0, ["bad_border"]);
    }
    const distance = Math.min(point.cameraX, 1 - point.cameraX, point.cameraY, 1 - point.cameraY);
    if (distance < BORDER_BAD_MARGIN) {
        return component(0, ["bad_border"]);
    }
    if (distance >= BORDER_GOOD_MARGIN) {
        return goodComponent();
    }
    return component(smoothstep(BORDER_BAD_MARGIN, BORDER_GOOD_MARGIN, distance), ["bad_border"]);
}

export function evaluateArmBoneLength(
    arm: SincroPoseArmMotionSnapshot,
    previousArm: SincroPoseArmMotionSnapshot | undefined,
): ReliabilityScoreComponent {
    const current = armLengths(arm);
    if (current === undefined) {
        return component(0.5, ["missing_world_coordinates"]);
    }
    let result = component(scoreArmSegmentRatio(current.upper / current.lower), []);
    if (result.score < 1) {
        result = component(result.score, ["bone_length_inconsistent"]);
    }
    const previous = previousArm === undefined ? undefined : armLengths(previousArm);
    if (previous !== undefined) {
        const totalRatio = current.total / previous.total;
        if (totalRatio < 1 / BODY_RATIO_BAD || totalRatio > BODY_RATIO_BAD) {
            result = component(Math.min(result.score, 0.15), ["bone_length_inconsistent"]);
        } else if (totalRatio < 1 / BODY_RATIO_WARN || totalRatio > BODY_RATIO_WARN) {
            result = component(Math.min(result.score, 0.55), ["bone_length_inconsistent"]);
        }
    }
    return result;
}

export function evaluateBodyScale(
    pose: SincroPoseMotionSnapshot,
    previousPose: SincroPoseMotionSnapshot | undefined,
): ReliabilityScoreComponent {
    const width = pose.upperBody.shoulderWidth;
    if (!pose.detected || !isFiniteNumber(width) || width <= 0) {
        return component(0, ["body_scale_missing"]);
    }
    const previousWidth = previousPose?.upperBody.shoulderWidth;
    if (!isFiniteNumber(previousWidth) || previousWidth <= 0) {
        return goodComponent();
    }
    const ratio = width / previousWidth;
    if (ratio < 1 / BODY_RATIO_BAD || ratio > BODY_RATIO_BAD) {
        return component(0.15, ["body_scale_jump"]);
    }
    if (ratio < 1 / BODY_RATIO_WARN || ratio > BODY_RATIO_WARN) {
        return component(0.55, ["body_scale_jump"]);
    }
    return goodComponent();
}

export function evaluateTemporal(
    input: PoseReliabilityEstimatorInput,
    point: SincroPoseTargetPointSnapshot,
    previousPoint: SincroPoseTargetPointSnapshot | undefined,
): ReliabilityScoreComponent {
    if (input.previous === undefined || previousPoint === undefined) {
        return goodComponent();
    }
    const dtSec = (input.mediaTimeMs - input.previous.mediaTimeMs) / 1000;
    if (!isFiniteNumber(dtSec) || dtSec <= 0) {
        return component(0.5, ["invalid_dt"]);
    }
    if (!isFiniteNumber(point.cameraX) || !isFiniteNumber(point.cameraY)) {
        return component(0.5, ["invalid_dt"]);
    }
    const speed =
        Math.hypot(point.cameraX - previousPoint.cameraX, point.cameraY - previousPoint.cameraY) /
        dtSec;
    if (speed <= TEMPORAL_SPEED_GOOD) {
        return goodComponent();
    }
    if (speed > TEMPORAL_SPEED_BAD) {
        return component(0.1, ["temporal_jump"]);
    }
    return component(
        1 - ((speed - TEMPORAL_SPEED_GOOD) / (TEMPORAL_SPEED_BAD - TEMPORAL_SPEED_GOOD)) * 0.8,
        ["temporal_jump"],
    );
}

export function evaluateCameraQuality(
    cameraQuality: CameraQualityScore | undefined,
): ReliabilityScoreComponent {
    if (cameraQuality === undefined) {
        return component(0.75, ["camera_quality_missing"]);
    }
    const score = clamp01(cameraQuality.overall.score);
    return component(score, score < 0.45 ? ["camera_quality_bad"] : []);
}

export function averageComponentSets(
    componentSets: ReliabilityComponentSet[],
): ReliabilityComponentSet {
    return {
        modelPresence: averageComponents(componentSets.map((set) => set.modelPresence)),
        modelVisibility: averageComponents(componentSets.map((set) => set.modelVisibility)),
        tracking: averageComponents(componentSets.map((set) => set.tracking)),
        border: averageComponents(componentSets.map((set) => set.border)),
        boneLength: averageComponents(componentSets.map((set) => set.boneLength)),
        bodyScale: averageComponents(componentSets.map((set) => set.bodyScale)),
        temporal: averageComponents(componentSets.map((set) => set.temporal)),
        side: averageComponents(componentSets.map((set) => set.side)),
        roi: averageComponents(componentSets.map((set) => set.roi)),
        cameraQuality: averageComponents(componentSets.map((set) => set.cameraQuality)),
    };
}

export function averageComponents(
    components: ReliabilityScoreComponent[],
): ReliabilityScoreComponent {
    return component(
        components.reduce((sum, entry) => sum + entry.score, 0) / components.length,
        uniqueReasons(components.flatMap((entry) => entry.reasonCodes)),
    );
}

export function unavailableComponents(): ReliabilityComponentSet {
    return {
        modelPresence: component(0, ["not_available_in_pose_snapshot"]),
        modelVisibility: component(0, ["not_available_in_pose_snapshot"]),
        tracking: component(0, ["not_available_in_pose_snapshot"]),
        border: component(0, ["not_available_in_pose_snapshot"]),
        boneLength: component(0, ["not_available_in_pose_snapshot"]),
        bodyScale: component(0, ["not_available_in_pose_snapshot"]),
        temporal: component(0, ["not_available_in_pose_snapshot"]),
        side: component(0, ["not_available_in_pose_snapshot"]),
        roi: component(0, ["not_available_in_pose_snapshot"]),
        cameraQuality: component(0, ["not_available_in_pose_snapshot"]),
    };
}

export function component(
    score: number,
    reasonCodes: ReliabilityReasonCode[],
): ReliabilityScoreComponent {
    return { score: clamp01(score), reasonCodes: uniqueReasons(reasonCodes) };
}

export function goodComponent(): ReliabilityScoreComponent {
    return component(1, []);
}

export function isPoseTargetLost(
    pose: SincroPoseMotionSnapshot,
    point: SincroPoseTargetPointSnapshot,
): boolean {
    return !pose.detected || !point.tracked || point.quality === "lost";
}

export function finiteOrZero(value: number): number {
    return isFiniteNumber(value) ? value : 0;
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function uniqueReasons(reasons: ReliabilityReasonCode[]): ReliabilityReasonCode[] {
    return [...new Set(reasons)];
}

function poseReasons(pose: SincroPoseMotionSnapshot): ReliabilityReasonCode[] {
    return pose.fallbackReason === undefined
        ? ["pose_not_detected"]
        : ["pose_not_detected", "fallback_snapshot"];
}

function armLengths(
    arm: SincroPoseArmMotionSnapshot,
): { upper: number; lower: number; total: number } | undefined {
    const shoulder = worldTuple(arm.targets.shoulder);
    const elbow = worldTuple(arm.targets.elbow);
    const wrist = worldTuple(arm.targets.wrist);
    if (shoulder === undefined || elbow === undefined || wrist === undefined) {
        return undefined;
    }
    const upper = distance3(shoulder, elbow);
    const lower = distance3(elbow, wrist);
    if (upper <= 0 || lower <= 0) {
        return undefined;
    }
    return { upper, lower, total: upper + lower };
}

function worldTuple(
    point: SincroPoseTargetPointSnapshot,
): readonly [number, number, number] | undefined {
    if (
        !point.world.hasWorldCoordinates ||
        !isFiniteNumber(point.world.normalizedX) ||
        !isFiniteNumber(point.world.normalizedY) ||
        !isFiniteNumber(point.world.normalizedZ)
    ) {
        return undefined;
    }
    return [point.world.normalizedX, point.world.normalizedY, point.world.normalizedZ];
}

function scoreArmSegmentRatio(ratio: number): number {
    if (ratio >= BONE_RATIO_LOW_WARN && ratio <= BONE_RATIO_HIGH_WARN) {
        return 1;
    }
    if (
        (ratio >= BONE_RATIO_LOW_BAD && ratio < BONE_RATIO_LOW_WARN) ||
        (ratio > BONE_RATIO_HIGH_WARN && ratio <= BONE_RATIO_HIGH_BAD)
    ) {
        return 0.55;
    }
    return 0.15;
}

function distance3(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
    if (!isFiniteNumber(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}
