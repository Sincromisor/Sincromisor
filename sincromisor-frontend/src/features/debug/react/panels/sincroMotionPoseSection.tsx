import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import {
    formatAnchorRuntime,
    formatArm,
    formatArmTargets,
    formatAvatarMotionProfile,
    formatCcdIkProbe,
    formatIkRuntime,
    formatInference,
    formatLowerBodyTargets,
    formatObserveOnlySummary,
    formatPoseRetargetStatus,
    formatPoseStatus,
    formatRatio,
    formatRetargetedArm,
    formatUpdatedAt,
    formatUpperBody,
} from "./sincroMotionPanelFormatters";
import { SincroPoseRetargetControls } from "./sincroPoseRetargetControls";

type SincroMotionPoseSectionProps = {
    pose: DebugConsoleSnapshot["sincroMotion"]["pose"];
    observeOnly: DebugConsoleSnapshot["sincroMotion"]["observeOnly"];
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    poseRetargetRuntime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"];
    manager: DebugConsoleManager;
};

export function SincroMotionPoseSection({
    pose,
    observeOnly,
    poseRetarget,
    poseRetargetRuntime,
    manager,
}: SincroMotionPoseSectionProps) {
    return (
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
                <dt>CCDIK PoC</dt>
                <dd>{formatCcdIkProbe(poseRetargetRuntime)}</dd>
                <dt>Anchor</dt>
                <dd>{formatAnchorRuntime(poseRetargetRuntime)}</dd>
                <dt>Avatar Profile</dt>
                <dd>{formatAvatarMotionProfile(poseRetargetRuntime)}</dd>
                <dt>Observe Only</dt>
                <dd>{formatObserveOnlySummary(observeOnly)}</dd>
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
            <SincroPoseRetargetControls poseRetarget={poseRetarget} manager={manager} />
        </article>
    );
}
