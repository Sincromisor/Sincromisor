import { GestureRecognizer } from "@mediapipe/tasks-vision";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import {
    serializeGestureRecognizerResult,
    type TrackerRuntimeMediaPipeRawResult,
} from "../trackingRuntime/mediaPipeRawResultSerializer";
import { loadMediaPipeVisionFileset } from "../trackingRuntime/mediaPipeVisionFileset";
import {
    cloneSincroGestureMotionSnapshot,
    createSincroGestureFallbackSnapshot,
    type SincroGestureMotionSnapshot,
    type SincroGestureWarningCode,
    uniqueGestureWarnings,
} from "./sincroGestureMotionSnapshot";
import {
    calculateGestureInferenceFps,
    handSnapshotCanDriveGesture,
    normalizeSincroGestureRecognizerResult,
    runSincroGestureRecognizer,
    type SincroGestureRecognizerLike,
} from "./sincroGestureTrackerHelpers";

const GESTURE_RECOGNIZER_MODEL_PATH = "/3rd_party/gesture_recognizer.task";

export type SincroGestureDetectOptions = Record<never, never>;
export type { SincroGestureRecognizerLike } from "./sincroGestureTrackerHelpers";

export type SincroGestureTrackerOptions = {
    gestureRecognizer?: SincroGestureRecognizerLike;
};

/**
 * GestureRecognizer を production optional pass として実行する facade。
 *
 * MediaPipe raw result はこの class 内で `SincroGestureMotionSnapshot` へ落とし、Hand tracker の左右
 * assignment を正本にして MotionIntent 用 raw label だけを出す。初期化失敗、GPU unavailable、推論例外、
 * Hand 未検出は例外で runtime 全体を止めず lost snapshot と warning に変換する。
 */
export class SincroGestureTracker {
    private gestureRecognizer?: SincroGestureRecognizerLike;
    private initPromise?: Promise<void>;
    private lastInferenceEndedAtMs?: number;
    private lastRawResult?: TrackerRuntimeMediaPipeRawResult["gesture"];
    private snapshot: SincroGestureMotionSnapshot = createSincroGestureFallbackSnapshot({
        trackingEnabled: false,
    });

    constructor(options: SincroGestureTrackerOptions = {}) {
        if (options.gestureRecognizer) {
            this.gestureRecognizer = options.gestureRecognizer;
            this.snapshot = createSincroGestureFallbackSnapshot({
                trackingEnabled: true,
                nowMs: performance.now(),
            });
        }
    }

    async initVision(): Promise<void> {
        if (this.gestureRecognizer) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.createGestureRecognizer().catch((error) => {
                this.initPromise = undefined;
                this.snapshot = createSincroGestureFallbackSnapshot({
                    reason: error instanceof Error ? error.message : String(error),
                    nowMs: performance.now(),
                    warnings: ["model_not_loaded"],
                });
                throw error;
            });
        }
        await this.initPromise;
    }

    modelIsLoaded(): boolean {
        return this.gestureRecognizer !== undefined;
    }

    detect(
        videoFrame: TexImageSource,
        handSnapshot: SincroHandMotionSnapshot,
        timestampMs: number,
        options: SincroGestureDetectOptions = {},
    ): SincroGestureMotionSnapshot {
        void options;
        if (!handSnapshotCanDriveGesture(handSnapshot)) {
            this.snapshot = createSincroGestureFallbackSnapshot({
                reason: "gesture_tracking_requires_detected_hand",
                nowMs: timestampMs,
                warnings: ["no_hand_detected"],
            });
            this.lastRawResult = undefined;
            return this.getSnapshot();
        }
        if (!this.gestureRecognizer) {
            this.snapshot = createSincroGestureFallbackSnapshot({
                reason: "GestureRecognizer model is not loaded.",
                nowMs: timestampMs,
                warnings: ["model_not_loaded"],
            });
            this.lastRawResult = undefined;
            return this.getSnapshot();
        }
        try {
            const detection = runSincroGestureRecognizer({
                gestureRecognizer: this.gestureRecognizer,
                videoFrame,
                timestampMs,
            });
            this.lastRawResult = serializeGestureRecognizerResult(detection.result);
            const sides = normalizeSincroGestureRecognizerResult({
                result: detection.result,
                hand: handSnapshot,
            });
            const inferenceFps = calculateGestureInferenceFps({
                lastInferenceEndedAtMs: this.lastInferenceEndedAtMs,
                inferenceEndedAtMs: detection.inferenceEndedAtMs,
            });
            this.lastInferenceEndedAtMs = detection.inferenceEndedAtMs;
            this.snapshot = {
                trackingEnabled: true,
                source:
                    sides.left?.source === "gesture-recognizer" ||
                    sides.right?.source === "gesture-recognizer"
                        ? "gesture-recognizer"
                        : "lost",
                left: sides.left,
                right: sides.right,
                warnings: collectGestureWarnings(sides),
                inferenceTimeMs: detection.inferenceTimeMs,
                inferenceFps,
                lastUpdatedAtMs: timestampMs,
            };
            return this.getSnapshot();
        } catch (error) {
            this.snapshot = createSincroGestureFallbackSnapshot({
                reason: error instanceof Error ? error.message : String(error),
                nowMs: timestampMs,
                warnings: ["inference_failed"],
            });
            this.lastRawResult = undefined;
            return this.getSnapshot();
        }
    }

    getSnapshot(): SincroGestureMotionSnapshot {
        return cloneSincroGestureMotionSnapshot(this.snapshot);
    }

    getLastRawResult(): TrackerRuntimeMediaPipeRawResult["gesture"] | undefined {
        return this.lastRawResult;
    }

    stop(
        reason: string | undefined = undefined,
        nowMs: number = performance.now(),
    ): SincroGestureMotionSnapshot {
        this.snapshot = createSincroGestureFallbackSnapshot({
            reason,
            nowMs,
            trackingEnabled: false,
        });
        this.lastInferenceEndedAtMs = undefined;
        this.lastRawResult = undefined;
        return this.getSnapshot();
    }

    dispose(): void {
        this.gestureRecognizer?.close();
        this.gestureRecognizer = undefined;
        this.initPromise = undefined;
        this.stop("GestureRecognizer disposed.");
    }

    private async createGestureRecognizer(): Promise<void> {
        const vision = await loadMediaPipeVisionFileset();
        this.gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: GESTURE_RECOGNIZER_MODEL_PATH,
                delegate: this.selectGestureRecognizerDelegate(),
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        this.snapshot = createSincroGestureFallbackSnapshot({
            trackingEnabled: true,
            nowMs: performance.now(),
        });
    }

    private selectGestureRecognizerDelegate(): "CPU" | "GPU" {
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }
}

function collectGestureWarnings(input: {
    left?: { warnings: SincroGestureWarningCode[] };
    right?: { warnings: SincroGestureWarningCode[] };
}): SincroGestureWarningCode[] {
    return uniqueGestureWarnings([
        ...(input.left?.warnings ?? []),
        ...(input.right?.warnings ?? []),
    ]);
}
