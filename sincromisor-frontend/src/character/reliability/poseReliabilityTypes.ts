import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { ReliabilityMap } from "./reliabilityMap";

export type PoseReliabilityEstimatorInput = {
    pose: SincroPoseMotionSnapshot;
    hand?: SincroHandMotionSnapshot;
    face?: SincroFaceMotionSnapshot;
    cameraQuality?: CameraQualityScore;
    previous?: {
        pose: SincroPoseMotionSnapshot;
        mediaTimeMs: number;
        reliability?: ReliabilityMap;
    };
    mediaTimeMs: number;
    video: { width: number; height: number };
};

export type ReliabilityComponentSet = ReliabilityMap["joints"]["leftWrist"]["components"];
export type ReliabilityScoreComponent = ReliabilityComponentSet["tracking"];
export type ReliabilityJointName = ReliabilityMap["parts"]["leftArm"]["joints"][number];
export type ArmSide = "left" | "right";
