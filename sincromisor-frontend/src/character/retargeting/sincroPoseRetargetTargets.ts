import { Vector3 } from "three/src/math/Vector3.js";
import type {
    SincroPoseArmTargetSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";

const MIN_STRONG_TARGET_CONFIDENCE = 0.45;

export function armWorldIkGateReason(targets: SincroPoseArmTargetSnapshot): string | undefined {
    if (!targets.shoulder.world.worldUsableForIk) {
        return armWorldIkTargetReason("shoulder", targets.shoulder);
    }
    if (!targets.elbow.world.worldUsableForIk) {
        return armWorldIkTargetReason("elbow", targets.elbow);
    }
    if (!targets.wrist.world.worldUsableForIk) {
        return armWorldIkTargetReason("wrist", targets.wrist);
    }
    return undefined;
}

export function mapWorldTargetDeltaToVrm(
    shoulder: SincroPoseTargetPointSnapshot,
    target: SincroPoseTargetPointSnapshot,
    scale: number,
): Vector3 {
    const deltaX = (target.world.normalizedX ?? 0) - (shoulder.world.normalizedX ?? 0);
    const deltaY = (target.world.normalizedY ?? 0) - (shoulder.world.normalizedY ?? 0);
    const deltaZ = (target.world.normalizedZ ?? 0) - (shoulder.world.normalizedZ ?? 0);
    // MediaPipe の world target を Three.js/VRM の Y-up 座標へ写像する。
    // Z は推定揺れが大きいため、横/縦より弱く使って肘の裏返りを抑える。
    return new Vector3(deltaX * scale, -deltaY * scale, -deltaZ * scale * 0.72);
}

export function armIkGateReason(targets: SincroPoseArmTargetSnapshot): string | undefined {
    if (!targets.shoulder.tracked) {
        return armIkTargetReason("shoulder", targets.shoulder);
    }
    if (!targets.elbow.usableForIk) {
        return armIkTargetReason("elbow", targets.elbow);
    }
    if (!targets.wrist.usableForIk) {
        return armIkTargetReason("wrist", targets.wrist);
    }
    return undefined;
}

function armWorldIkTargetReason(
    joint: "shoulder" | "elbow" | "wrist",
    target: SincroPoseTargetPointSnapshot,
): string {
    if (!target.world.hasWorldCoordinates) {
        return `world_ik_${joint}_${target.world.worldStaleReason ?? "missing"}`;
    }
    if (target.world.worldConfidence < MIN_STRONG_TARGET_CONFIDENCE) {
        return `world_ik_${joint}_low_confidence`;
    }
    return `world_ik_${joint}_missing`;
}

function armIkTargetReason(
    joint: "shoulder" | "elbow" | "wrist",
    target: SincroPoseTargetPointSnapshot,
): string {
    if (!target.hasFiniteCoordinates) {
        return `ik_${joint}_coordinates_missing`;
    }
    if (target.staleReason === "out_of_frame") {
        return `ik_${joint}_out_of_frame`;
    }
    if (target.confidence < MIN_STRONG_TARGET_CONFIDENCE) {
        return `ik_${joint}_low_confidence`;
    }
    return `ik_${joint}_missing`;
}
