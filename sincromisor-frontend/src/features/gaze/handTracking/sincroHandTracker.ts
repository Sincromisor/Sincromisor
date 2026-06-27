import { HandLandmarker } from "@mediapipe/tasks-vision";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import { loadMediaPipeVisionFileset } from "../trackingRuntime/mediaPipeVisionFileset";
import { createHandRoiFromPoseArm } from "../trackingRuntime/roiTracking/roiCoordinateMapping";
import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";
import {
    cloneSincroHandMotionSnapshot,
    createLostHandSideSnapshot,
    createSincroHandFallbackSnapshot,
    type SincroHandMotionSnapshot,
    type SincroHandPoint2,
    type SincroHandSideSnapshot,
    type SincroHandWarningCode,
    uniqueHandWarnings,
} from "./sincroHandMotionSnapshot";
import {
    createDefaultHandRoiCropFrame,
    type SincroHandRoiCropFactory,
} from "./sincroHandRoiCropFrame";
import {
    assignSincroHandObservationsToPose,
    calculateHandInferenceFps,
    handRoiIsUsable,
    handWarningsFromRoi,
    normalizeSincroHandLandmarkerResult,
    runSincroHandLandmarker,
    type SincroHandLandmarkerLike,
} from "./sincroHandTrackerHelpers";

const HAND_LANDMARKER_MODEL_PATH = "/3rd_party/hand_landmarker.task";

export type SincroHandDetectOptions = Record<never, never>;
export type { SincroHandRoiCropFactory } from "./sincroHandRoiCropFrame";
export type { SincroHandLandmarkerLike } from "./sincroHandTrackerHelpers";

export type SincroHandTrackerOptions = {
    handLandmarker?: SincroHandLandmarkerLike;
    createCropFrame?: SincroHandRoiCropFactory;
};

// HandLandmarker の結果を palm / finger の低次元 snapshot へ落とす facade。
// wrist は assignment と信頼度材料にだけ使い、腕 IK target は Pose snapshot を正本にする。
export class SincroHandTracker {
    private handLandmarker?: SincroHandLandmarkerLike;
    private initPromise?: Promise<void>;
    private lastInferenceEndedAtMs?: number;
    private snapshot: SincroHandMotionSnapshot = createSincroHandFallbackSnapshot({
        trackingEnabled: false,
    });
    private readonly createCropFrame: SincroHandRoiCropFactory;

    constructor(options: SincroHandTrackerOptions = {}) {
        this.createCropFrame = options.createCropFrame ?? createDefaultHandRoiCropFrame;
        if (options.handLandmarker) {
            this.handLandmarker = options.handLandmarker;
            this.snapshot = createSincroHandFallbackSnapshot({
                trackingEnabled: true,
                nowMs: performance.now(),
            });
        }
    }

    async initVision(): Promise<void> {
        if (this.handLandmarker) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.createHandLandmarker().catch((error) => {
                this.initPromise = undefined;
                this.snapshot = createSincroHandFallbackSnapshot({
                    reason: "HandLandmarker の初期化に失敗しました。",
                    nowMs: performance.now(),
                    warnings: ["model_not_loaded"],
                });
                throw error;
            });
        }
        await this.initPromise;
    }

    modelIsLoaded(): boolean {
        return this.handLandmarker !== undefined;
    }

    detect(
        videoFrame: TexImageSource,
        poseSnapshot: SincroPoseMotionSnapshot,
        timestampMs: number,
        options: SincroHandDetectOptions = {},
    ): SincroHandMotionSnapshot {
        void options;
        if (!this.handLandmarker) {
            this.snapshot = createSincroHandFallbackSnapshot({
                reason: "HandLandmarker model is not loaded.",
                nowMs: timestampMs,
                warnings: ["model_not_loaded"],
            });
            return this.getSnapshot();
        }
        try {
            this.snapshot = this.detectWithPoseRoi(videoFrame, poseSnapshot, timestampMs);
            return this.getSnapshot();
        } catch (error) {
            this.snapshot = createSincroHandFallbackSnapshot({
                reason: error instanceof Error ? error.message : String(error),
                nowMs: timestampMs,
            });
            return this.getSnapshot();
        }
    }

    getSnapshot(): SincroHandMotionSnapshot {
        return cloneSincroHandMotionSnapshot(this.snapshot);
    }

    stop(
        reason: string | undefined = undefined,
        nowMs: number = performance.now(),
    ): SincroHandMotionSnapshot {
        this.snapshot = createSincroHandFallbackSnapshot({
            reason,
            nowMs,
            trackingEnabled: false,
        });
        this.lastInferenceEndedAtMs = undefined;
        return this.getSnapshot();
    }

    dispose(): void {
        this.handLandmarker?.close();
        this.handLandmarker = undefined;
        this.initPromise = undefined;
        this.stop("HandLandmarker disposed.");
    }

    private async createHandLandmarker(): Promise<void> {
        const vision = await loadMediaPipeVisionFileset();
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: HAND_LANDMARKER_MODEL_PATH,
                delegate: this.selectHandLandmarkerDelegate(),
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        this.snapshot = createSincroHandFallbackSnapshot({
            trackingEnabled: true,
            nowMs: performance.now(),
        });
    }

    private selectHandLandmarkerDelegate(): "CPU" | "GPU" {
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }

    private detectWithPoseRoi(
        videoFrame: TexImageSource,
        poseSnapshot: SincroPoseMotionSnapshot,
        timestampMs: number,
    ): SincroHandMotionSnapshot {
        const leftRoi = createHandRoiFromPoseArm({
            side: "left",
            arm: poseSnapshot.leftArm,
            shoulderWidth: poseSnapshot.upperBody.shoulderWidth,
        });
        const rightRoi = createHandRoiFromPoseArm({
            side: "right",
            arm: poseSnapshot.rightArm,
            shoulderWidth: poseSnapshot.upperBody.shoulderWidth,
        });
        const leftWrist = poseWristFromSnapshot("left", poseSnapshot);
        const rightWrist = poseWristFromSnapshot("right", poseSnapshot);
        const leftUsable = handRoiIsUsable(leftRoi);
        const rightUsable = handRoiIsUsable(rightRoi);

        if (!leftUsable && !rightUsable) {
            return this.detectFullFrameFallback({
                videoFrame,
                timestampMs,
                leftWrist,
                rightWrist,
                warnings: uniqueHandWarnings([
                    ...handWarningsFromRoi(leftRoi),
                    ...handWarningsFromRoi(rightRoi),
                ]),
            });
        }

        const left = leftUsable
            ? this.detectRoiSide({
                  videoFrame,
                  timestampMs,
                  roi: leftRoi,
                  side: "left",
                  leftWrist,
                  rightWrist,
              })
            : lostRoiSide("left", leftRoi);
        const right = rightUsable
            ? this.detectRoiSide({
                  videoFrame,
                  timestampMs,
                  roi: rightRoi,
                  side: "right",
                  leftWrist,
                  rightWrist,
              })
            : lostRoiSide("right", rightRoi);
        return this.createMotionSnapshot({
            leftHand: addPoseStaleWarning(left, leftWrist),
            rightHand: addPoseStaleWarning(right, rightWrist),
            inferenceTimeMs: left.inferenceTimeMs + right.inferenceTimeMs,
            inferenceEndedAtMs: Math.max(left.inferenceEndedAtMs, right.inferenceEndedAtMs),
            timestampMs,
        });
    }

    private detectRoiSide(input: {
        videoFrame: TexImageSource;
        timestampMs: number;
        roi: SincroRoiObservation;
        side: "left" | "right";
        leftWrist: ReturnType<typeof poseWristFromSnapshot>;
        rightWrist: ReturnType<typeof poseWristFromSnapshot>;
    }): SincroHandSideDetection {
        const cropFrame = this.createCropFrame({ videoFrame: input.videoFrame, roi: input.roi });
        if (cropFrame === undefined) {
            return {
                ...lostRoiSide(input.side, input.roi, ["roi_missing"]),
                inferenceTimeMs: 0,
                inferenceEndedAtMs: performance.now(),
            };
        }
        const detection = this.runHandLandmarker(cropFrame, input.timestampMs);
        const observations = normalizeSincroHandLandmarkerResult({
            result: detection.result,
            roi: input.roi,
        });
        const assignment = assignSincroHandObservationsToPose({
            observations,
            leftWrist: input.leftWrist,
            rightWrist: input.rightWrist,
            source: "roi",
            roi: input.roi,
            previous: this.snapshot,
        });
        return {
            ...(input.side === "left" ? assignment.leftHand : assignment.rightHand),
            inferenceTimeMs: detection.inferenceTimeMs,
            inferenceEndedAtMs: detection.inferenceEndedAtMs,
        };
    }

    private detectFullFrameFallback(input: {
        videoFrame: TexImageSource;
        timestampMs: number;
        leftWrist: ReturnType<typeof poseWristFromSnapshot>;
        rightWrist: ReturnType<typeof poseWristFromSnapshot>;
        warnings: SincroHandWarningCode[];
    }): SincroHandMotionSnapshot {
        const detection = this.runHandLandmarker(input.videoFrame, input.timestampMs);
        const observations = normalizeSincroHandLandmarkerResult({ result: detection.result });
        const assignment = assignSincroHandObservationsToPose({
            observations,
            leftWrist: input.leftWrist,
            rightWrist: input.rightWrist,
            source: "full-frame-fallback",
            previous: this.snapshot,
        });
        return this.createMotionSnapshot({
            leftHand: addWarnings(addPoseStaleWarning(assignment.leftHand, input.leftWrist), [
                ...input.warnings,
            ]),
            rightHand: addWarnings(addPoseStaleWarning(assignment.rightHand, input.rightWrist), [
                ...input.warnings,
            ]),
            inferenceTimeMs: detection.inferenceTimeMs,
            inferenceEndedAtMs: detection.inferenceEndedAtMs,
            timestampMs: input.timestampMs,
        });
    }

    private createMotionSnapshot(input: {
        leftHand: SincroHandSideSnapshot;
        rightHand: SincroHandSideSnapshot;
        inferenceTimeMs: number;
        inferenceEndedAtMs: number;
        timestampMs: number;
    }): SincroHandMotionSnapshot {
        const inferenceFps = calculateHandInferenceFps({
            lastInferenceEndedAtMs: this.lastInferenceEndedAtMs,
            inferenceEndedAtMs: input.inferenceEndedAtMs,
        });
        this.lastInferenceEndedAtMs = input.inferenceEndedAtMs;
        return {
            trackingEnabled: true,
            detected: input.leftHand.detected || input.rightHand.detected,
            leftHand: input.leftHand,
            rightHand: input.rightHand,
            inferenceTimeMs: input.inferenceTimeMs,
            inferenceFps,
            lastUpdatedAtMs: input.timestampMs,
        };
    }

    private runHandLandmarker(
        videoFrame: TexImageSource,
        timestampMs: number,
    ): ReturnType<typeof runSincroHandLandmarker> {
        return runSincroHandLandmarker({
            handLandmarker: this.handLandmarker,
            videoFrame,
            timestampMs,
        });
    }
}

type SincroHandSideDetection = SincroHandSideSnapshot & {
    inferenceTimeMs: number;
    inferenceEndedAtMs: number;
};

function poseWristFromSnapshot(
    side: "left" | "right",
    poseSnapshot: SincroPoseMotionSnapshot,
): { side: "left" | "right"; point?: SincroHandPoint2; confidence: number; stale: boolean } {
    const wrist =
        side === "left" ? poseSnapshot.leftArm.targets.wrist : poseSnapshot.rightArm.targets.wrist;
    if (wrist.quality === "lost" || !wrist.hasFiniteCoordinates) {
        return { side, confidence: 0, stale: wrist.stale };
    }
    return {
        side,
        point: [wrist.cameraX, wrist.cameraY],
        confidence: wrist.confidence,
        stale: wrist.stale,
    };
}

function lostRoiSide(
    side: "left" | "right",
    roi: SincroRoiObservation,
    warnings: SincroHandWarningCode[] = [],
): SincroHandSideDetection {
    return {
        ...createLostHandSideSnapshot(side, [
            "landmarks_missing",
            ...handWarningsFromRoi(roi),
            ...warnings,
        ]),
        roi,
        inferenceTimeMs: 0,
        inferenceEndedAtMs: performance.now(),
    };
}

function addPoseStaleWarning<T extends SincroHandSideSnapshot>(
    snapshot: T,
    wrist: { stale: boolean },
): T {
    if (!wrist.stale) {
        return snapshot;
    }
    return addWarnings(snapshot, ["pose_stale_for_roi"]);
}

function addWarnings<T extends SincroHandSideSnapshot>(
    snapshot: T,
    warnings: SincroHandWarningCode[],
): T {
    return {
        ...snapshot,
        warnings: uniqueHandWarnings([...snapshot.warnings, ...warnings]),
    };
}
