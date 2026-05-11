import type { SincroFaceMotionSnapshot } from "../../../ts/FaceTracking/SincroFaceMotionSnapshot";
import type { SincroPoseArmMotionSnapshot, SincroPoseMotionSnapshot } from "../../../ts/FaceTracking/SincroPoseMotionSnapshot";
import type { DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { debugPanelClassName, type DebugPanelProps } from "../debugConsoleTypes";

type SincroMotionPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
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

export function SincroMotionPanel({ snapshot, isActive }: SincroMotionPanelProps) {
    const face = snapshot.sincroMotion.face;
    const pose = snapshot.sincroMotion.pose;

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
                        <dt>Confidence</dt>
                        <dd>{formatRatio(pose.confidence)}</dd>
                        <dt>Upper</dt>
                        <dd>{formatUpperBody(pose)}</dd>
                        <dt>Left Arm</dt>
                        <dd>{formatArm(pose.leftArm)}</dd>
                        <dt>Right Arm</dt>
                        <dd>{formatArm(pose.rightArm)}</dd>
                        <dt>Inference</dt>
                        <dd>{formatInference(pose.inferenceTimeMs, pose.inferenceFps)}</dd>
                        <dt>Failures</dt>
                        <dd>{pose.consecutiveFailures}</dd>
                        <dt>Updated</dt>
                        <dd>{formatUpdatedAt(pose.lastUpdatedAtMs)}</dd>
                    </dl>
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

function formatPoseStatus(snapshot: SincroPoseMotionSnapshot): string {
    if (snapshot.degradedToFaceOnly) {
        return `face-only (${snapshot.fallbackReason ?? "performance_gate"})`;
    }
    return formatTrackingStatus(snapshot.trackingEnabled, snapshot.detected, snapshot.fallbackReason);
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
