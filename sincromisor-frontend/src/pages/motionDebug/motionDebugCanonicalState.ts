import { createCanonicalUpperBodyState } from "../../character/canonical/canonicalArmFeatureExtractor";
import { estimateCanonicalTorsoFrame } from "../../character/canonical/canonicalTorsoFrameEstimator";
import type { CanonicalUpperBodyState } from "../../character/canonical/canonicalUpperBodyState";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";

export type MotionDebugCanonicalStateInput = {
    pose: SincroPoseMotionSnapshot;
    face?: Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose">;
    previous?: CanonicalUpperBodyState;
    mediaTimeMs: number;
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
    });
}
