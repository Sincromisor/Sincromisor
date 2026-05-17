import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { loadMediaPipeVisionFileset } from "./MediaPipeVisionFileset";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "./SincroPoseMotionSnapshot";
import {
    cloneSincroPoseLowerBodyTargets,
    cloneSincroPoseMotionSnapshot,
    createSincroPoseFallbackSnapshot,
} from "./sincroPoseMotionSnapshotClone";
import { normalizeSincroPoseLandmarkerResult } from "./sincroPoseTrackerNormalizer";

const POSE_LANDMARKER_MODEL_PATH = "/3rd_party/pose_landmarker_lite.task";

// PoseLandmarker の上半身ランドマークを、低振幅 retarget 用の内部 snapshot へ正規化する。
// ここでは高精度IKを狙わず、肩・上腕・前腕が暴れないことを優先して confidence gate を強めに置く。
export class SincroPoseTracker {
    private poseLandmarker?: PoseLandmarker;
    private initPromise?: Promise<void>;
    private lastInferenceEndedAtMs?: number;
    private consecutiveFailures = 0;
    private snapshot: SincroPoseMotionSnapshot = {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
        rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
        lowerBodyTargets: cloneSincroPoseLowerBodyTargets(
            DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
        ),
    };

    async initVision(): Promise<void> {
        if (this.poseLandmarker) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.createPoseLandmarker().catch((error) => {
                this.initPromise = undefined;
                this.snapshot = createSincroPoseFallbackSnapshot({
                    reason: "PoseLandmarker の初期化に失敗しました。",
                    nowMs: performance.now(),
                    consecutiveFailures: this.consecutiveFailures,
                });
                throw error;
            });
        }
        await this.initPromise;
    }

    modelIsLoaded(): boolean {
        return this.poseLandmarker !== undefined;
    }

    detect(videoFrame: TexImageSource, timestampMs: number): SincroPoseMotionSnapshot {
        if (!this.poseLandmarker) {
            this.snapshot = createSincroPoseFallbackSnapshot({
                reason: "PoseLandmarker model is not loaded.",
                nowMs: timestampMs,
                consecutiveFailures: this.consecutiveFailures,
            });
            return this.snapshot;
        }

        const inferenceStartedAtMs = performance.now();
        const result = this.poseLandmarker.detectForVideo(videoFrame, timestampMs);
        const inferenceEndedAtMs = performance.now();
        const inferenceTimeMs = inferenceEndedAtMs - inferenceStartedAtMs;
        const inferenceFps =
            this.lastInferenceEndedAtMs === undefined
                ? 0
                : 1000 / Math.max(1, inferenceEndedAtMs - this.lastInferenceEndedAtMs);
        this.lastInferenceEndedAtMs = inferenceEndedAtMs;
        const normalized = normalizeSincroPoseLandmarkerResult({
            result,
            inferenceTimeMs,
            inferenceFps,
            nowMs: timestampMs,
            consecutiveFailures: this.consecutiveFailures,
        });
        this.consecutiveFailures = normalized.consecutiveFailures;
        this.snapshot = normalized.snapshot;
        return this.getSnapshot();
    }

    getSnapshot(): SincroPoseMotionSnapshot {
        return cloneSincroPoseMotionSnapshot(this.snapshot);
    }

    stop(
        reason: string | undefined = undefined,
        nowMs: number = performance.now(),
    ): SincroPoseMotionSnapshot {
        this.snapshot = {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            lowerBodyTargets: cloneSincroPoseLowerBodyTargets(
                DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
            ),
            fallbackReason: reason,
            lastUpdatedAtMs: nowMs,
        };
        this.lastInferenceEndedAtMs = undefined;
        this.consecutiveFailures = 0;
        return this.getSnapshot();
    }

    dispose(): void {
        this.poseLandmarker?.close();
        this.poseLandmarker = undefined;
        this.initPromise = undefined;
        this.stop("PoseLandmarker disposed.");
    }

    private async createPoseLandmarker(): Promise<void> {
        const vision = await loadMediaPipeVisionFileset();
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: POSE_LANDMARKER_MODEL_PATH,
                delegate: this.selectPoseLandmarkerDelegate(),
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
        });
        this.snapshot = {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            lowerBodyTargets: cloneSincroPoseLowerBodyTargets(
                DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
            ),
            trackingEnabled: true,
            lastUpdatedAtMs: performance.now(),
        };
    }

    private selectPoseLandmarkerDelegate(): "CPU" | "GPU" {
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }
}
