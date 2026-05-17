import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseLowerBodyTargetSnapshot,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "./SincroPoseMotionSnapshot";

type SincroPoseFallbackSnapshotOptions = {
    reason?: string;
    nowMs?: number;
    consecutiveFailures?: number;
    trackingEnabled?: boolean;
};

// pose snapshot は UI / retargeter へ配るため、ネストした target まで参照を分離する。
export function cloneSincroPoseMotionSnapshot(
    snapshot: SincroPoseMotionSnapshot,
): SincroPoseMotionSnapshot {
    return {
        ...snapshot,
        upperBody: { ...snapshot.upperBody },
        leftArm: cloneSincroPoseArmSnapshot(snapshot.leftArm),
        rightArm: cloneSincroPoseArmSnapshot(snapshot.rightArm),
        lowerBodyTargets: cloneSincroPoseLowerBodyTargets(snapshot.lowerBodyTargets),
    };
}

export function createSincroPoseFallbackSnapshot({
    reason,
    nowMs,
    consecutiveFailures = 0,
    trackingEnabled = true,
}: SincroPoseFallbackSnapshotOptions = {}): SincroPoseMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
        rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
        lowerBodyTargets: cloneSincroPoseLowerBodyTargets(
            DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
        ),
        trackingEnabled,
        fallbackReason: reason,
        consecutiveFailures,
        lastUpdatedAtMs: nowMs,
    };
}

export function cloneSincroPoseLowerBodyTargets(
    snapshot: SincroPoseLowerBodyTargetSnapshot,
): SincroPoseLowerBodyTargetSnapshot {
    return {
        leftHip: cloneSincroPoseTargetPoint(snapshot.leftHip),
        rightHip: cloneSincroPoseTargetPoint(snapshot.rightHip),
        leftKnee: cloneSincroPoseTargetPoint(snapshot.leftKnee),
        rightKnee: cloneSincroPoseTargetPoint(snapshot.rightKnee),
        leftAnkle: cloneSincroPoseTargetPoint(snapshot.leftAnkle),
        rightAnkle: cloneSincroPoseTargetPoint(snapshot.rightAnkle),
    };
}

function cloneSincroPoseTargetPoint(
    snapshot: SincroPoseTargetPointSnapshot,
): SincroPoseTargetPointSnapshot {
    return {
        ...snapshot,
        world: { ...snapshot.world },
    };
}

function cloneSincroPoseArmSnapshot(
    snapshot: SincroPoseArmMotionSnapshot,
): SincroPoseArmMotionSnapshot {
    return {
        ...snapshot,
        targets: {
            shoulder: cloneSincroPoseTargetPoint(snapshot.targets.shoulder),
            elbow: cloneSincroPoseTargetPoint(snapshot.targets.elbow),
            wrist: cloneSincroPoseTargetPoint(snapshot.targets.wrist),
        },
    };
}
