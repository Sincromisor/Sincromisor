import type { SincroFaceMotionSnapshot } from "../../../ts/FaceTracking/SincroFaceMotionSnapshot";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../../ts/FaceTracking/SincroPoseMotionSnapshot";
import { DebugConsoleManager, type DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { RangeControl } from "../components/RangeControl";
import { debugPanelClassName, type DebugPanelProps } from "../debugConsoleTypes";

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
                        <dd>{formatTrackingStatus(face.trackingEnabled, face.detected, face.fallbackReason)}</dd>
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
                        <dd>{formatPoseRetargetStatus(pose, poseRetarget.minConfidence)}</dd>
                        <dt>Confidence</dt>
                        <dd>{formatRatio(pose.confidence)}</dd>
                        <dt>Upper</dt>
                        <dd>{formatUpperBody(pose)}</dd>
                        <dt>Left Arm</dt>
                        <dd>{formatArm(pose.leftArm)}</dd>
                        <dt>Left Targets</dt>
                        <dd>{formatArmTargets(pose.leftArm)}</dd>
                        <dt>Right Arm</dt>
                        <dd>{formatArm(pose.rightArm)}</dd>
                        <dt>Right Targets</dt>
                        <dd>{formatArmTargets(pose.rightArm)}</dd>
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
                            onChange={(value) => manager.applySincroPoseRetargetConfig({
                                ...poseRetarget,
                                intensityScale: value,
                            })}
                        />
                        <RangeControl
                            id="sincroPoseRetargetMinConfidence"
                            label="Min Confidence"
                            valueLabel={poseRetarget.minConfidence.toFixed(2)}
                            min="0"
                            max="1"
                            step="0.05"
                            value={poseRetarget.minConfidence}
                            onChange={(value) => manager.applySincroPoseRetargetConfig({
                                ...poseRetarget,
                                minConfidence: value,
                            })}
                        />
                        <RangeControl
                            id="sincroPoseRetargetSmoothing"
                            label="Smoothing"
                            valueLabel={`${Math.round(poseRetarget.smoothingMs)}ms`}
                            min="40"
                            max="800"
                            step="10"
                            value={poseRetarget.smoothingMs}
                            onChange={(value) => manager.applySincroPoseRetargetConfig({
                                ...poseRetarget,
                                smoothingMs: value,
                            })}
                        />
                        <RangeControl
                            id="sincroPoseRetargetNeutralReturn"
                            label="Neutral Return"
                            valueLabel={`${Math.round(poseRetarget.returnToNeutralMs)}ms`}
                            min="80"
                            max="2000"
                            step="20"
                            value={poseRetarget.returnToNeutralMs}
                            onChange={(value) => manager.applySincroPoseRetargetConfig({
                                ...poseRetarget,
                                returnToNeutralMs: value,
                            })}
                        />
                    </details>
                </article>
            </div>
        </section>
    );
}

function formatTrackingStatus(enabled: boolean, detected: boolean, fallbackReason: string | null): string {
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
    return snapshot.fallbackReason ? `${base} (${snapshot.fallbackReason}) / ${perf}` : `${base} / ${perf}`;
}

function formatPoseStatus(snapshot: SincroPoseMotionSnapshot): string {
    if (snapshot.degradedToFaceOnly) {
        return `face-only (${snapshot.fallbackReason ?? "performance_gate"})`;
    }
    return formatTrackingStatus(snapshot.trackingEnabled, snapshot.detected, snapshot.fallbackReason);
}

function formatPoseRetargetStatus(snapshot: SincroPoseMotionSnapshot, minConfidence: number): string {
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

function formatTargetPoint(snapshot: SincroPoseTargetPointSnapshot): string {
    if (!snapshot.tracked) {
        return `lost ${formatRatio(snapshot.confidence)} ${snapshot.staleReason ?? "stale"}`;
    }
    return `(${snapshot.localX.toFixed(2)}, ${snapshot.localY.toFixed(2)}) ${formatRatio(snapshot.confidence)}`;
}

function formatInference(timeMs: number, fps: number): string {
    return `${timeMs.toFixed(1)}ms / ${fps.toFixed(1)}fps`;
}

function formatRatio(value: number): string {
    return value.toFixed(2);
}

function formatUpdatedAt(value: number | null): string {
    if (value == null) {
        return "-";
    }
    return `${Math.round(value)}ms`;
}
