import type { SincroFaceMotionSnapshot } from "../../../ts/FaceTracking/SincroFaceMotionSnapshot";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../../ts/FaceTracking/SincroPoseMotionSnapshot";
import type { SincroPoseRetargetedArm } from "../../../ts/SincroVRM/VRMCharacter/SincroPoseRetargeter";
import type { DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";

export function formatTrackingStatus(
    enabled: boolean,
    detected: boolean,
    fallbackReason: string | undefined,
): string {
    if (!enabled) {
        return fallbackReason ? `off (${fallbackReason})` : "off";
    }
    if (fallbackReason) {
        return `fallback (${fallbackReason})`;
    }
    return detected ? "detected" : "lost";
}

export function formatTrackerRuntime(
    snapshot: DebugConsoleSnapshot["sincroMotion"]["tracker"],
): string {
    const base = `${snapshot.mode} / ${snapshot.status}`;
    const perf = `load ${snapshot.loadTimeMs.toFixed(1)}ms / transfer ${snapshot.transferTimeMs.toFixed(1)}ms / rtt ${snapshot.workerRoundTripMs.toFixed(1)}ms / drop ${snapshot.droppedFrames}`;
    return snapshot.fallbackReason
        ? `${base} (${snapshot.fallbackReason}) / ${perf}`
        : `${base} / ${perf}`;
}

export function formatPoseStatus(snapshot: SincroPoseMotionSnapshot): string {
    if (snapshot.degradedToFaceOnly) {
        return `face-only (${snapshot.fallbackReason ?? "performance_gate"})`;
    }
    return formatTrackingStatus(
        snapshot.trackingEnabled,
        snapshot.detected,
        snapshot.fallbackReason,
    );
}

export function formatPoseRetargetStatus(
    snapshot: SincroPoseMotionSnapshot,
    minConfidence: number,
    runtime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"],
): string {
    if (runtime.fallbackReason) {
        return `neutral (${runtime.fallbackReason})`;
    }
    if (!snapshot.trackingEnabled) {
        return "off";
    }
    if (snapshot.degradedToFaceOnly) {
        return "neutral (face-only)";
    }
    if (!snapshot.detected) {
        return "neutral (lost)";
    }
    if (snapshot.confidence < minConfidence) {
        return "neutral (confidence)";
    }
    return "active";
}

export function formatIkRuntime(
    runtime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"],
): string {
    const armReasons = [
        formatIkArmRuntime("L", runtime.leftArm),
        formatIkArmRuntime("R", runtime.rightArm),
    ].join(" / ");
    if (runtime.fallbackReason) {
        return `${runtime.ikMode} (${runtime.fallbackReason}) / ${armReasons}`;
    }
    return `${runtime.ikMode} / confidence ${formatRatio(runtime.confidence)} / ${armReasons}`;
}

export function formatCcdIkProbe(
    runtime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"],
): string {
    const probe = runtime.solverProbe.ccdik;
    if (!probe) {
        return "not measured";
    }
    const normalized = probe.normalizedChainInSkeleton
        ? "normalized in skeleton"
        : "normalized separate";
    const raw = probe.rawChainInSkeleton ? "raw chain found" : "raw chain missing";
    return `${probe.side} ${probe.status} (${probe.reason}) / meshes ${probe.skinnedMeshCount} / ${normalized} / ${raw}`;
}

export function formatAnchorRuntime(
    runtime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"],
): string {
    const offset = runtime.anchor.shoulderOffset;
    return `${runtime.anchor.active ? "active" : "fallback"} ${formatRatio(runtime.anchor.weight)} / ${runtime.anchor.reason} / offset ${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}`;
}

export function formatHeadPose(snapshot: SincroFaceMotionSnapshot): string {
    return `yaw ${snapshot.headPose.yawDeg.toFixed(1)} / pitch ${snapshot.headPose.pitchDeg.toFixed(1)} / roll ${snapshot.headPose.rollDeg.toFixed(1)}`;
}

export function formatUpperBody(snapshot: SincroPoseMotionSnapshot): string {
    return `roll ${snapshot.upperBody.shoulderRoll.toFixed(2)} / lean ${snapshot.upperBody.torsoLean.toFixed(2)} / width ${snapshot.upperBody.shoulderWidth.toFixed(2)}`;
}

export function formatArm(snapshot: SincroPoseArmMotionSnapshot): string {
    if (!snapshot.tracked) {
        return `lost (${formatRatio(snapshot.confidence)})`;
    }
    return `lift ${snapshot.upperArmLift.toFixed(2)} / open ${snapshot.upperArmOpen.toFixed(2)} / flex ${snapshot.lowerArmFlex.toFixed(2)} / wrist ${snapshot.wristRaise.toFixed(2)}`;
}

export function formatArmTargets(snapshot: SincroPoseArmMotionSnapshot): string {
    return [
        `S ${formatTargetPoint(snapshot.targets.shoulder)}`,
        `E ${formatTargetPoint(snapshot.targets.elbow)}`,
        `W ${formatTargetPoint(snapshot.targets.wrist)}`,
    ].join(" / ");
}

export function formatLowerBodyTargets(snapshot: SincroPoseMotionSnapshot): string {
    const targets = snapshot.lowerBodyTargets;
    return [
        `LH ${formatTargetPoint(targets.leftHip)}`,
        `RH ${formatTargetPoint(targets.rightHip)}`,
        `LK ${formatTargetPoint(targets.leftKnee)}`,
        `RK ${formatTargetPoint(targets.rightKnee)}`,
        `LA ${formatTargetPoint(targets.leftAnkle)}`,
        `RA ${formatTargetPoint(targets.rightAnkle)}`,
    ].join(" / ");
}

export function formatRetargetedArm(snapshot: SincroPoseRetargetedArm): string {
    const state = snapshot.ikActive
        ? `${snapshot.ikSolverMode} ${formatRatio(snapshot.ikWeight)}`
        : snapshot.active
          ? "feature"
          : `fallback ${snapshot.fallbackReason ?? "neutral"}`;
    const constraint = formatArmConstraint(snapshot);
    const quaternionState =
        snapshot.upperArmQuaternion && snapshot.lowerArmQuaternion
            ? ` / q upper ${formatQuaternion(snapshot.upperArmQuaternion)} / q lower ${formatQuaternion(snapshot.lowerArmQuaternion)}`
            : "";
    const constraintState = constraint ? ` / ${constraint}` : "";
    return `${state}${constraintState} / upper ${formatVector(snapshot.upperArm)} / lower ${formatVector(snapshot.lowerArm)} / wrist ${formatVector(snapshot.wrist)}${quaternionState}`;
}

export function formatInference(timeMs: number, fps: number): string {
    return `${timeMs.toFixed(1)}ms / ${fps.toFixed(1)}fps`;
}

export function formatRatio(value: number): string {
    return value.toFixed(2);
}

export function formatUpdatedAt(value: number | undefined): string {
    if (value === undefined) {
        return "-";
    }
    return `${Math.round(value)}ms`;
}

export function radToDeg(value: number): number {
    return (value * 180) / Math.PI;
}

function formatIkArmRuntime(label: "L" | "R", snapshot: SincroPoseRetargetedArm): string {
    if (!snapshot.ikActive) {
        return `${label} ${snapshot.fallbackReason ?? "feature"}`;
    }
    const mode =
        snapshot.ikSolverMode === "world_3d_ik"
            ? "world_3d_ik"
            : snapshot.ikSolverMode === "screen_space_ik"
              ? "screen_ik"
              : "ik";
    const constraint = formatArmConstraint(snapshot);
    return constraint
        ? `${label} ${mode} ${formatRatio(snapshot.ikWeight)} ${constraint}`
        : `${label} ${mode} ${formatRatio(snapshot.ikWeight)}`;
}

function formatArmConstraint(snapshot: SincroPoseRetargetedArm): string {
    if (snapshot.constraint.reasons.length === 0) {
        return "";
    }
    const push =
        snapshot.constraint.targetPushDistance > 0
            ? ` push ${snapshot.constraint.targetPushDistance.toFixed(3)}`
            : "";
    return `constraints ${snapshot.constraint.reasons.join(",")} weight ${formatRatio(snapshot.constraint.weightScale)}${push}`;
}

function formatTargetPoint(snapshot: SincroPoseTargetPointSnapshot): string {
    const coordinateState = snapshot.hasFiniteCoordinates ? "coords_ok" : "coords_missing";
    const ikState = snapshot.usableForIk ? `ik ${formatRatio(snapshot.ikWeight)}` : "ik none";
    const imageTarget = snapshot.tracked
        ? `2d ${snapshot.quality} (${snapshot.localX.toFixed(2)}, ${snapshot.localY.toFixed(2)}) ${formatRatio(snapshot.confidence)} ${coordinateState} ${ikState}`
        : `2d ${snapshot.quality} ${formatRatio(snapshot.confidence)} ${coordinateState} ${ikState} ${snapshot.staleReason ?? "stale"}`;
    return `${imageTarget}; ${formatWorldTarget(snapshot)}`;
}

function formatWorldTarget(snapshot: SincroPoseTargetPointSnapshot): string {
    const world = snapshot.world;
    const ikState = world.worldUsableForIk ? `ik ${formatRatio(world.worldIkWeight)}` : "ik none";
    if (!world.hasWorldCoordinates) {
        return `world none ${ikState} ${world.worldStaleReason ?? "world_missing"}`;
    }
    const x = world.normalizedX?.toFixed(2) ?? "-";
    const y = world.normalizedY?.toFixed(2) ?? "-";
    const z = world.normalizedZ?.toFixed(2) ?? "-";
    const anchor = world.anchor === "none" ? "no_anchor" : world.anchor;
    return `world ${world.worldQuality} ${anchor} (${x}, ${y}, ${z}) ${formatRatio(world.worldConfidence)} ${ikState}`;
}

function formatVector(value: { x: number; y: number; z: number }): string {
    return `${radToDeg(value.x).toFixed(1)}, ${radToDeg(value.y).toFixed(1)}, ${radToDeg(value.z).toFixed(1)}deg`;
}

function formatQuaternion(value: { x: number; y: number; z: number; w: number }): string {
    return `${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)}, ${value.w.toFixed(2)}`;
}
