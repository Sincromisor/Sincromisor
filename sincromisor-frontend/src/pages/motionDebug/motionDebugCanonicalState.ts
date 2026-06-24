import { createCanonicalUpperBodyState } from "../../character/canonical/canonicalArmFeatureExtractor";
import { estimateCanonicalTorsoFrame } from "../../character/canonical/canonicalTorsoFrameEstimator";
import type { CanonicalUpperBodyState } from "../../character/canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../../character/reliability/reliabilityMap";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { MotionDebugCanonicalReliabilityInput } from "./types";

export type MotionDebugCanonicalStateInput = {
    pose: SincroPoseMotionSnapshot;
    face?: Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose">;
    previous?: CanonicalUpperBodyState;
    mediaTimeMs: number;
    reliability?: ReliabilityMap;
};

export function createMotionDebugCanonicalState(
    input: MotionDebugCanonicalStateInput,
): CanonicalUpperBodyState {
    const torso = estimateCanonicalTorsoFrame({
        pose: input.pose,
        face: input.face,
        previous: input.previous,
        mediaTimeMs: input.mediaTimeMs,
    });
    return createCanonicalUpperBodyState({
        pose: input.pose,
        torso,
        previous: input.previous,
        mediaTimeMs: input.mediaTimeMs,
        reliability: input.reliability,
    });
}

export function createMotionDebugCanonicalReliabilityInput(
    reliability: ReliabilityMap | undefined,
): MotionDebugCanonicalReliabilityInput | undefined {
    if (reliability === undefined) {
        return undefined;
    }
    return {
        schemaVersion: reliability.schemaVersion,
        mediaTimeMs: reliability.timestamp.mediaTimeMs,
        leftArm: {
            partWeight: reliability.parts.leftArm.finalWeight,
            minJointWeight: Math.min(
                reliability.joints.leftShoulder.finalWeight,
                reliability.joints.leftElbow.finalWeight,
                reliability.joints.leftWrist.finalWeight,
            ),
        },
        rightArm: {
            partWeight: reliability.parts.rightArm.finalWeight,
            minJointWeight: Math.min(
                reliability.joints.rightShoulder.finalWeight,
                reliability.joints.rightElbow.finalWeight,
                reliability.joints.rightWrist.finalWeight,
            ),
        },
    };
}
