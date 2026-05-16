import type { SincroFaceMotionSnapshot } from "../../../ts/FaceTracking/SincroFaceMotionSnapshot";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../../ts/FaceTracking/SincroPoseMotionSnapshot";
import type { SincroPoseRetargetedArm } from "../../../ts/SincroVRM/VRMCharacter/SincroPoseRetargeter";
import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { RangeControl } from "../components/RangeControl";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";

type SincroMotionPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
    manager: DebugConsoleManager;
};

const FACE_BLENDSHAPE_KEYS = [
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "jawOpen",
    "mouthSmileLeft",
    "mouthSmileRight",
    "mouthFunnel",
    "mouthPucker",
];

export function SincroMotionPanel({ snapshot, manager, isActive }: SincroMotionPanelProps) {
    const face = snapshot.sincroMotion.face;
    const pose = snapshot.sincroMotion.pose;
    const tracker = snapshot.sincroMotion.tracker;
    const poseRetarget = snapshot.sincroMotion.poseRetarget;
    const poseRetargetRuntime = snapshot.sincroMotion.poseRetargetRuntime;

    return (
        <section
            id="debug-console-panel-sincro"
            className={debugPanelClassName("debugCard debugCard--sincro", isActive)}
            data-debug-panel="sincro"
            role="tabpanel"
            aria-labelledby="debug-console-tab-sincro"
            hidden={!isActive}
        >
            <h3>Sincro Motion</h3>
            <div className="sincroMotionGrid">
                <article className="sincroMotionSection">
                    <h4>Face</h4>
                    <dl className="gazeTable">
                        <dt>Runtime</dt>
                        <dd>{formatTrackerRuntime(tracker)}</dd>
                        <dt>Status</dt>
                        <dd>
                            {formatTrackingStatus(
                                face.trackingEnabled,
                                face.detected,
                                face.fallbackReason,
                            )}
                        </dd>
                        <dt>Confidence</dt>
                        <dd>{formatRatio(face.confidence)}</dd>
                        <dt>Head</dt>
                        <dd>{formatHeadPose(face)}</dd>
                        <dt>Inference</dt>
                        <dd>{formatInference(face.inferenceTimeMs, face.inferenceFps)}</dd>
                        <dt>Updated</dt>
                        <dd>{formatUpdatedAt(face.lastUpdatedAtMs)}</dd>
                    </dl>
                    <div className="sincroBlendshapeGrid">
                        {FACE_BLENDSHAPE_KEYS.map((key) => (
                            <div className="sincroBlendshapeMeter" key={key}>
                                <span>{key}</span>
                                <meter min={0} max={1} value={face.blendshapes[key] ?? 0}></meter>
                                <strong>{formatRatio(face.blendshapes[key] ?? 0)}</strong>
                            </div>
                        ))}
                    </div>
                </article>
                <article className="sincroMotionSection">
                    <h4>Pose</h4>
                    <dl className="gazeTable">
                        <dt>Status</dt>
                        <dd>{formatPoseStatus(pose)}</dd>
                        <dt>Retarget</dt>
                        <dd>
                            {formatPoseRetargetStatus(
                                pose,
                                poseRetarget.minConfidence,
                                poseRetargetRuntime,
                            )}
                        </dd>
                        <dt>IK</dt>
                        <dd>{formatIkRuntime(poseRetargetRuntime)}</dd>
                        <dt>Anchor</dt>
                        <dd>{formatAnchorRuntime(poseRetargetRuntime)}</dd>
                        <dt>Confidence</dt>
                        <dd>{formatRatio(pose.confidence)}</dd>
                        <dt>Upper</dt>
                        <dd>{formatUpperBody(pose)}</dd>
                        <dt>Left Arm</dt>
                        <dd>{formatArm(pose.leftArm)}</dd>
                        <dt>Left Targets</dt>
                        <dd>{formatArmTargets(pose.leftArm)}</dd>
                        <dt>Left Solver</dt>
                        <dd>{formatRetargetedArm(poseRetargetRuntime.leftArm)}</dd>
                        <dt>Right Arm</dt>
                        <dd>{formatArm(pose.rightArm)}</dd>
                        <dt>Right Targets</dt>
                        <dd>{formatArmTargets(pose.rightArm)}</dd>
                        <dt>Right Solver</dt>
                        <dd>{formatRetargetedArm(poseRetargetRuntime.rightArm)}</dd>
                        <dt>Lower Targets</dt>
                        <dd>{formatLowerBodyTargets(pose)}</dd>
                        <dt>Inference</dt>
                        <dd>{formatInference(pose.inferenceTimeMs, pose.inferenceFps)}</dd>
                        <dt>Failures</dt>
                        <dd>{pose.consecutiveFailures}</dd>
                        <dt>Updated</dt>
                        <dd>{formatUpdatedAt(pose.lastUpdatedAtMs)}</dd>
                    </dl>
                    <details className="audioInlineDetails">
                        <summary>Pose retarget 調整</summary>
                        <RangeControl
                            id="sincroPoseRetargetIntensity"
                            label="Intensity"
                            valueLabel={`${Math.round(poseRetarget.intensityScale * 100)}%`}
                            min="0"
                            max="1.2"
                            step="0.05"
                            value={poseRetarget.intensityScale}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    intensityScale: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetMinConfidence"
                            label="Min Confidence"
                            valueLabel={poseRetarget.minConfidence.toFixed(2)}
                            min="0"
                            max="1"
                            step="0.05"
                            value={poseRetarget.minConfidence}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    minConfidence: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetSmoothing"
                            label="Smoothing"
                            valueLabel={`${Math.round(poseRetarget.smoothingMs)}ms`}
                            min="40"
                            max="800"
                            step="10"
                            value={poseRetarget.smoothingMs}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    smoothingMs: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetNeutralReturn"
                            label="Neutral Return"
                            valueLabel={`${Math.round(poseRetarget.returnToNeutralMs)}ms`}
                            min="80"
                            max="2000"
                            step="20"
                            value={poseRetarget.returnToNeutralMs}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    returnToNeutralMs: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetIkStrength"
                            label="IK Strength"
                            valueLabel={`${Math.round(poseRetarget.armIkStrength * 100)}%`}
                            min="0"
                            max="1"
                            step="0.05"
                            value={poseRetarget.armIkStrength}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    armIkStrength: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetIkTargetScale"
                            label="IK Target Scale"
                            valueLabel={poseRetarget.armIkTargetScale.toFixed(2)}
                            min="0.2"
                            max="1.5"
                            step="0.05"
                            value={poseRetarget.armIkTargetScale}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    armIkTargetScale: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetIkMaxLift"
                            label="Max Lift"
                            valueLabel={`${Math.round(radToDeg(poseRetarget.armIkMaxLiftRad))}deg`}
                            min="0"
                            max={String(Math.PI / 2)}
                            step="0.02"
                            value={poseRetarget.armIkMaxLiftRad}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    armIkMaxLiftRad: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetIkMaxOpen"
                            label="Max Open"
                            valueLabel={`${Math.round(radToDeg(poseRetarget.armIkMaxOpenRad))}deg`}
                            min="0"
                            max={String(Math.PI / 2)}
                            step="0.02"
                            value={poseRetarget.armIkMaxOpenRad}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    armIkMaxOpenRad: value,
                                })
                            }
                        />
                        <RangeControl
                            id="sincroPoseRetargetIkMaxFlex"
                            label="Max Flex"
                            valueLabel={`${Math.round(radToDeg(poseRetarget.armIkMaxForearmFlexRad))}deg`}
                            min="0"
                            max={String(Math.PI / 2)}
                            step="0.02"
                            value={poseRetarget.armIkMaxForearmFlexRad}
                            onChange={(value) =>
                                manager.applySincroPoseRetargetConfig({
                                    ...poseRetarget,
                                    armIkMaxForearmFlexRad: value,
                                })
                            }
                        />
                    </details>
                </article>
            </div>
        </section>
    );
}

function formatTrackingStatus(
    enabled: boolean,
    detected: boolean,
    fallbackReason: string | null,
): string {
    if (!enabled) {
        return fallbackReason ? `off (${fallbackReason})` : "off";
    }
    if (fallbackReason) {
        return `fallback (${fallbackReason})`;
    }
    return detected ? "detected" : "lost";
}

function formatTrackerRuntime(snapshot: DebugConsoleSnapshot["sincroMotion"]["tracker"]): string {
    const base = `${snapshot.mode} / ${snapshot.status}`;
    const perf = `load ${snapshot.loadTimeMs.toFixed(1)}ms / transfer ${snapshot.transferTimeMs.toFixed(1)}ms / rtt ${snapshot.workerRoundTripMs.toFixed(1)}ms / drop ${snapshot.droppedFrames}`;
    return snapshot.fallbackReason
        ? `${base} (${snapshot.fallbackReason}) / ${perf}`
        : `${base} / ${perf}`;
}

function formatPoseStatus(snapshot: SincroPoseMotionSnapshot): string {
    if (snapshot.degradedToFaceOnly) {
        return `face-only (${snapshot.fallbackReason ?? "performance_gate"})`;
    }
    return formatTrackingStatus(
        snapshot.trackingEnabled,
        snapshot.detected,
        snapshot.fallbackReason,
    );
}

function formatPoseRetargetStatus(
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

function formatIkRuntime(
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

function formatIkArmRuntime(label: "L" | "R", snapshot: SincroPoseRetargetedArm): string {
    if (!snapshot.ikActive) {
        return `${label} ${snapshot.fallbackReason ?? "feature"}`;
    }
    const mode = snapshot.ikWeight >= 0.98 ? "full_ik" : "weak_ik";
    return `${label} ${mode} ${formatRatio(snapshot.ikWeight)}`;
}

function formatAnchorRuntime(
    runtime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"],
): string {
    const offset = runtime.anchor.shoulderOffset;
    return `${runtime.anchor.active ? "active" : "fallback"} ${formatRatio(runtime.anchor.weight)} / ${runtime.anchor.reason} / offset ${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}`;
}

function formatHeadPose(snapshot: SincroFaceMotionSnapshot): string {
    return `yaw ${snapshot.headPose.yawDeg.toFixed(1)} / pitch ${snapshot.headPose.pitchDeg.toFixed(1)} / roll ${snapshot.headPose.rollDeg.toFixed(1)}`;
}

function formatUpperBody(snapshot: SincroPoseMotionSnapshot): string {
    return `roll ${snapshot.upperBody.shoulderRoll.toFixed(2)} / lean ${snapshot.upperBody.torsoLean.toFixed(2)} / width ${snapshot.upperBody.shoulderWidth.toFixed(2)}`;
}

function formatArm(snapshot: SincroPoseArmMotionSnapshot): string {
    if (!snapshot.tracked) {
        return `lost (${formatRatio(snapshot.confidence)})`;
    }
    return `lift ${snapshot.upperArmLift.toFixed(2)} / open ${snapshot.upperArmOpen.toFixed(2)} / flex ${snapshot.lowerArmFlex.toFixed(2)} / wrist ${snapshot.wristRaise.toFixed(2)}`;
}

function formatArmTargets(snapshot: SincroPoseArmMotionSnapshot): string {
    return [
        `S ${formatTargetPoint(snapshot.targets.shoulder)}`,
        `E ${formatTargetPoint(snapshot.targets.elbow)}`,
        `W ${formatTargetPoint(snapshot.targets.wrist)}`,
    ].join(" / ");
}

function formatLowerBodyTargets(snapshot: SincroPoseMotionSnapshot): string {
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

function formatRetargetedArm(snapshot: SincroPoseRetargetedArm): string {
    const state = snapshot.ikActive
        ? `ik ${formatRatio(snapshot.ikWeight)}`
        : snapshot.active
          ? "feature"
          : `fallback ${snapshot.fallbackReason ?? "neutral"}`;
    return `${state} / upper ${formatVector(snapshot.upperArm)} / lower ${formatVector(snapshot.lowerArm)} / wrist ${formatVector(snapshot.wrist)}`;
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

function formatInference(timeMs: number, fps: number): string {
    return `${timeMs.toFixed(1)}ms / ${fps.toFixed(1)}fps`;
}

function formatRatio(value: number): string {
    return value.toFixed(2);
}

function formatVector(value: { x: number; y: number; z: number }): string {
    return `${radToDeg(value.x).toFixed(1)}, ${radToDeg(value.y).toFixed(1)}, ${radToDeg(value.z).toFixed(1)}deg`;
}

function radToDeg(value: number): number {
    return (value * 180) / Math.PI;
}

function formatUpdatedAt(value: number | null): string {
    if (value == null) {
        return "-";
    }
    return `${Math.round(value)}ms`;
}
