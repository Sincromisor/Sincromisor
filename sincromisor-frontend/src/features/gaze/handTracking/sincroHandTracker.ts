/** 手の推論モデルと時間計測を所有し、正規化→特徴量→左右割当の結果をスナップショットとして返す。 */
// reason: structure-threshold-exception モデルの生存期間と左右ROI・全画面代替推論を同じ所有者に保ち、時刻と前回スナップショットの更新順序を維持する。
import { HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import {
    serializeHandLandmarkerResult,
    type TrackerRuntimeMediaPipeRawResult,
} from "../trackingRuntime/mediaPipeRawResultSerializer";
import { loadMediaPipeVisionFileset } from "../trackingRuntime/mediaPipeVisionFileset";
import { createHandRoiFromPoseArm } from "../trackingRuntime/roiTracking/roiCoordinateMapping";
import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";
import { assignSincroHandObservationsToPose } from "./sincroHandAssignment";
import { handWarningsFromRoi } from "./sincroHandAssignmentSnapshot";
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
import { normalizeSincroHandLandmarkerResult } from "./sincroHandNormalization";
import {
    createDefaultHandRoiCropFrame,
    type SincroHandRoiCropFactory,
} from "./sincroHandRoiCropFrame";

const HAND_LANDMARKER_MODEL_PATH = "/3rd_party/hand_landmarker.task";

export type SincroHandDetectOptions = Record<never, never>;

/** 手推論の実行と解放に必要なMediaPipeの窓口。モデルの生成・破棄は追跡制御が所有する。 */
type SincroHandLandmarkerLike = {
    detectForVideo(videoFrame: TexImageSource, timestampMs: number): HandLandmarkerResult;
    close(): void;
};

/** 未加工の推論結果と性能計測値。所要時間・終了時刻はperformance.now基準のミリ秒。 */
type SincroHandLandmarkerInference = {
    result: HandLandmarkerResult;
    inferenceTimeMs: number;
    inferenceEndedAtMs: number;
};

/** 推論モデルと切り抜き生成の差し替え口。渡されたモデルも追跡クラスが破棄する。 */
export type SincroHandTrackerOptions = {
    handLandmarker?: SincroHandLandmarkerLike;
    createCropFrame?: SincroHandRoiCropFactory;
};

/** 手の推論から低次元特徴を返す。手首は左右割当と信頼度にだけ使い、腕IKの目標はPoseが所有する。 */
export class SincroHandTracker {
    private handLandmarker?: SincroHandLandmarkerLike;
    private initPromise?: Promise<void>;
    private lastInferenceEndedAtMs?: number;
    private lastRawResult?: TrackerRuntimeMediaPipeRawResult["hand"];
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

    /** 映像時刻で手を推論する。モデル未読込・推論失敗は理由付きの未検出スナップショットへ変換する。 */
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
            this.lastRawResult = undefined;
            return this.getSnapshot();
        }
        try {
            this.lastRawResult = undefined;
            this.snapshot = this.detectWithPoseRoi(videoFrame, poseSnapshot, timestampMs);
            return this.getSnapshot();
        } catch (error) {
            this.snapshot = createSincroHandFallbackSnapshot({
                reason: error instanceof Error ? error.message : String(error),
                nowMs: timestampMs,
            });
            this.lastRawResult = undefined;
            return this.getSnapshot();
        }
    }

    getSnapshot(): SincroHandMotionSnapshot {
        return cloneSincroHandMotionSnapshot(this.snapshot);
    }

    getLastRawResult(): TrackerRuntimeMediaPipeRawResult["hand"] | undefined {
        return this.lastRawResult;
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
        this.lastRawResult = undefined;
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

    // 有効な左右ROIを順に推論し、両側とも利用不可の場合だけ全画面へ切り替える。
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

    // 切り抜き生成後に推論・座標復元・特徴量・左右割当を行い、対象側の計測結果を返す。
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

    // 全画面代替では未加工結果も保存し、ROI経路と同じ正規化・割当へ渡す。
    private detectFullFrameFallback(input: {
        videoFrame: TexImageSource;
        timestampMs: number;
        leftWrist: ReturnType<typeof poseWristFromSnapshot>;
        rightWrist: ReturnType<typeof poseWristFromSnapshot>;
        warnings: SincroHandWarningCode[];
    }): SincroHandMotionSnapshot {
        const detection = this.runHandLandmarker(input.videoFrame, input.timestampMs);
        this.lastRawResult = serializeHandLandmarkerResult(detection.result);
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

    // 左右ROIでは時間の合計と最後の終了時刻、全画面では単一推論の値から頻度を計算する。
    private createMotionSnapshot(input: {
        leftHand: SincroHandSideSnapshot;
        rightHand: SincroHandSideSnapshot;
        inferenceTimeMs: number;
        inferenceEndedAtMs: number;
        timestampMs: number;
    }): SincroHandMotionSnapshot {
        // 推論終了時刻の差で頻度を出す。初回は0、同時刻は1ミリ秒として扱う。
        const inferenceFps =
            this.lastInferenceEndedAtMs === undefined
                ? 0
                : 1000 / Math.max(1, input.inferenceEndedAtMs - this.lastInferenceEndedAtMs);
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

    /** 映像時刻をモデルへ渡し、推論呼び出しだけをperformance.now基準のミリ秒で計測する。 */
    private runHandLandmarker(
        videoFrame: TexImageSource,
        timestampMs: number,
    ): SincroHandLandmarkerInference {
        const inferenceStartedAtMs = performance.now();
        const result = this.handLandmarker?.detectForVideo(videoFrame, timestampMs);
        const inferenceEndedAtMs = performance.now();
        if (result === undefined) {
            throw new Error("HandLandmarker model is not loaded.");
        }
        return {
            result,
            inferenceTimeMs: inferenceEndedAtMs - inferenceStartedAtMs,
            inferenceEndedAtMs,
        };
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

/** Pose手首由来で信頼度と面積を持つROIだけを切り抜き推論に使う。 */
function handRoiIsUsable(roi: SincroRoiObservation): boolean {
    return (
        roi.source === "pose-wrist" &&
        roi.confidence > 0 &&
        roi.rect.width > 0 &&
        roi.rect.height > 0
    );
}
