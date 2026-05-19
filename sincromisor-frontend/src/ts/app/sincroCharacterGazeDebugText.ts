import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../faceTracking/sincroPoseMotionSnapshot";

export function formatSincroFaceDebug(snapshot: SincroFaceMotionSnapshot): string {
    if (snapshot.fallbackReason) {
        return `sincro face: ${snapshot.fallbackReason}`;
    }
    return [
        `sincro face:${snapshot.detected ? "detected" : "lost"}`,
        `yaw:${snapshot.headPose.yawDeg.toFixed(1)}`,
        `pitch:${snapshot.headPose.pitchDeg.toFixed(1)}`,
        `roll:${snapshot.headPose.rollDeg.toFixed(1)}`,
        `infer:${snapshot.inferenceTimeMs.toFixed(1)}ms`,
        `fps:${snapshot.inferenceFps.toFixed(1)}`,
    ].join(" ");
}

export function formatSincroPoseDebug(snapshot: SincroPoseMotionSnapshot): string {
    if (snapshot.degradedToFaceOnly) {
        return `sincro pose: face-only fallback (${snapshot.fallbackReason ?? "performance_gate"})`;
    }
    if (snapshot.fallbackReason) {
        return `sincro pose: ${snapshot.fallbackReason}`;
    }
    return [
        `sincro pose:${snapshot.detected ? "detected" : "lost"}`,
        `conf:${snapshot.confidence.toFixed(2)}`,
        `targets:L${formatArmTargetAvailability(snapshot.leftArm)} R${formatArmTargetAvailability(snapshot.rightArm)}`,
        `infer:${snapshot.inferenceTimeMs.toFixed(1)}ms`,
        `fps:${snapshot.inferenceFps.toFixed(1)}`,
    ].join(" ");
}

export function formatErrorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function formatArmTargetAvailability(arm: SincroPoseMotionSnapshot["leftArm"]): string {
    return [
        arm.targets.shoulder.tracked ? "S" : "-",
        arm.targets.elbow.tracked ? "E" : "-",
        arm.targets.wrist.tracked ? "W" : "-",
    ].join("");
}
