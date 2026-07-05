import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { GestureIntentObservation } from "../motionIntent/motionIntentEstimator";
import type { ReliabilityMap } from "./reliabilityMap";

/**
 * Pose reliability map を生成する public input boundary。
 *
 * `gesture` は optional pass の normalized observation だけを受け、MediaPipe raw result は扱わない。
 * 未指定時は `ReliabilityMap.gesture` を従来の neutral placeholder に保つ。指定時だけ
 * `previous.reliability?.gesture` と同じ `mediaTimeMs` 基準で gesture stability を更新する。
 */
export type PoseReliabilityEstimatorInput = {
    pose: SincroPoseMotionSnapshot;
    hand?: SincroHandMotionSnapshot;
    face?: SincroFaceMotionSnapshot;
    /**
     * `SincroGestureMotionSnapshot` から抽出済みの side / label / confidence。
     *
     * side は raw handedness ではなく left/right key 由来の normalized side。欠損時は旧 pose-only
     * 経路互換の placeholder を維持し、旧 log replay で保存されていない Gesture 観測を捏造しない。
     */
    gesture?: GestureIntentObservation;
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
