import type { Detection, FaceDetector } from "@mediapipe/tasks-vision";
import { frontendLogger } from "../logging/appLogger";
import type { CharacterGazeKeypointSmoother } from "./characterGazeKeypointSmoother";
import { buildCharacterGazeTargetDebugText } from "./characterGazeTargetDebugText";
import type { FaceTargetSelector } from "./faceTargetSelector";

const VIDEO_FRAME_STALE_MS = 1200;
const MIN_DETECTABLE_VIDEO_DIMENSION_PX = 2;

type CharacterGazePredictionLoopOptions = {
    videoElement: HTMLVideoElement;
    keypointSmoother: CharacterGazeKeypointSmoother;
    faceTargetSelector: FaceTargetSelector;
    getFaceDetector: () => FaceDetector | undefined;
    getArriveCallback: () => () => void;
    getLeaveCallback: () => () => void;
};

// video frame の鮮度確認、MediaPipe 推論、在席/離席イベント変換をまとめて管理する。
export class CharacterGazePredictionLoop {
    private readonly videoElement: HTMLVideoElement;
    private readonly keypointSmoother: CharacterGazeKeypointSmoother;
    private readonly faceTargetSelector: FaceTargetSelector;
    private readonly getFaceDetector: () => FaceDetector | undefined;
    private readonly getArriveCallback: () => () => void;
    private readonly getLeaveCallback: () => () => void;
    private lastVideoTime: number = -1;
    private lastVideoFrameUpdatedAtMs: number = -1;
    private lastDetectedTime: number = -1;
    private detected: boolean = false;
    private predictionLoopEnabled: boolean = false;
    private predictionLoopRunning: boolean = false;
    private predictionFrameId?: number;
    private detectionCallback?: (detection: Detection[]) => void;
    private detectionErrorCallback?: (error: unknown) => void;
    private loadedDataHandlerBound?: () => void;
    private lastTargetDebugText = "-";

    constructor(options: CharacterGazePredictionLoopOptions) {
        this.videoElement = options.videoElement;
        this.keypointSmoother = options.keypointSmoother;
        this.faceTargetSelector = options.faceTargetSelector;
        this.getFaceDetector = options.getFaceDetector;
        this.getArriveCallback = options.getArriveCallback;
        this.getLeaveCallback = options.getLeaveCallback;
    }

    targetSelectionDebugText(): string {
        return this.lastTargetDebugText;
    }

    detecting(): boolean {
        const nowMs = performance.now();
        const videoFrameIsStale =
            this.lastVideoFrameUpdatedAtMs >= 0 &&
            nowMs - this.lastVideoFrameUpdatedAtMs > VIDEO_FRAME_STALE_MS;
        return !videoFrameIsStale && nowMs - this.lastDetectedTime < 5000;
    }

    attachCamera(
        videoTrack: MediaStreamTrack,
        callback: (detection: Detection[]) => void,
        errorCallback?: (error: unknown) => void,
    ): void {
        const videoStream = new MediaStream();
        videoStream.addTrack(videoTrack);
        this.videoElement.setAttribute("autoplay", "true");
        this.videoElement.setAttribute("playsinline", "true");
        this.videoElement.setAttribute("muted", "true");
        this.videoElement.srcObject = videoStream;
        this.detectionCallback = callback;
        this.detectionErrorCallback = errorCallback;
        this.predictionLoopEnabled = true;
        if (!this.loadedDataHandlerBound) {
            this.loadedDataHandlerBound = () => {
                this.startPredictionLoopIfNeeded();
            };
            this.videoElement.addEventListener("loadeddata", this.loadedDataHandlerBound);
        }
        this.resetVideoFrameState();
        this.startPredictionLoopIfNeeded();
    }

    detachCamera(): void {
        this.stopPredictionLoop();
        this.detectionCallback = undefined;
        this.detectionErrorCallback = undefined;
        this.detected = false;
        this.resetVideoFrameState();
        this.keypointSmoother.easeToNeutral();
        this.videoElement.pause();
        this.videoElement.srcObject = null;
    }

    stopPredictionLoop(): void {
        this.predictionLoopEnabled = false;
        this.predictionLoopRunning = false;
        this.faceTargetSelector.reset();
        this.lastTargetDebugText = "停止中";
        if (this.predictionFrameId !== undefined) {
            window.cancelAnimationFrame(this.predictionFrameId);
            this.predictionFrameId = undefined;
        }
    }

    resumePredictionLoop(): void {
        this.predictionLoopEnabled = true;
        this.lastTargetDebugText = "-";
        this.startPredictionLoopIfNeeded();
    }

    private resetVideoFrameState(): void {
        this.lastVideoTime = -1;
        this.lastVideoFrameUpdatedAtMs = -1;
        this.lastDetectedTime = -1;
    }

    private startPredictionLoopIfNeeded(): void {
        if (!this.predictionLoopEnabled || this.predictionLoopRunning) {
            return;
        }
        if (!this.detectionCallback) {
            return;
        }
        if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
        }
        if (!this.videoFrameIsReadyForDetection()) {
            this.predictionFrameId = window.requestAnimationFrame(() => {
                this.predictionFrameId = undefined;
                this.startPredictionLoopIfNeeded();
            });
            return;
        }
        this.predictionLoopRunning = true;
        void this.predictCam(this.detectionCallback);
    }

    private async predictCam(callback: (detection: Detection[]) => void): Promise<void> {
        if (!this.preparePredictionFrame()) {
            return;
        }
        const startTimeMs = performance.now();
        if (this.videoElement.currentTime !== this.lastVideoTime) {
            if (!this.processFreshVideoFrame(startTimeMs, callback)) {
                return;
            }
        } else {
            this.recoverStoppedPreviewVideo(startTimeMs, callback);
        }
        this.scheduleNextPrediction(callback);
    }

    private preparePredictionFrame(): boolean {
        if (!this.predictionLoopEnabled) {
            this.predictionLoopRunning = false;
            this.predictionFrameId = undefined;
            return false;
        }
        if (!this.getFaceDetector()) {
            this.predictionLoopRunning = false;
            return false;
        }
        return true;
    }

    private processFreshVideoFrame(
        startTimeMs: number,
        callback: (detection: Detection[]) => void,
    ): boolean {
        this.lastVideoTime = this.videoElement.currentTime;
        this.lastVideoFrameUpdatedAtMs = startTimeMs;
        if (!this.videoFrameIsReadyForDetection()) {
            this.handleFrozenVideoFrame(startTimeMs, callback);
            return true;
        }
        const detections = this.detectForCurrentVideo(startTimeMs);
        if (detections === undefined) {
            return false;
        }
        this.applyDetections(detections, startTimeMs);
        this.emitDetectionStatusChanges();
        callback(detections);
        return true;
    }

    private detectForCurrentVideo(startTimeMs: number): Detection[] | undefined {
        const faceDetector = this.getFaceDetector();
        if (!faceDetector) {
            return undefined;
        }
        try {
            return faceDetector.detectForVideo(this.videoElement, startTimeMs).detections;
        } catch (error) {
            this.handleDetectionRuntimeError(error);
            return undefined;
        }
    }

    private applyDetections(detections: Detection[], startTimeMs: number): void {
        if (detections.length === 0) {
            this.lastTargetDebugText = "対象なし";
            return;
        }
        const selected = this.faceTargetSelector.select(detections, startTimeMs);
        this.lastTargetDebugText = buildCharacterGazeTargetDebugText(selected);
        if (selected.selectedIndex === undefined) {
            return;
        }
        const targetDetection = detections[selected.selectedIndex];
        this.keypointSmoother.updateFromKeypoints(targetDetection.keypoints, startTimeMs);
        this.lastDetectedTime = performance.now();
        this.videoElement.dispatchEvent(new Event("detect"));
    }

    private emitDetectionStatusChanges(): void {
        const newStatus = this.detecting();
        if (this.detected !== newStatus) {
            this.dispatchPresenceChange(newStatus);
            this.detected = newStatus;
        }
        if (!this.detected) {
            this.keypointSmoother.easeToNeutral();
        }
    }

    private recoverStoppedPreviewVideo(
        startTimeMs: number,
        callback: (detection: Detection[]) => void,
    ): void {
        this.videoElement.play();
        this.handleFrozenVideoFrame(startTimeMs, callback);
    }

    private videoFrameIsReadyForDetection(): boolean {
        return (
            this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            this.videoElement.videoWidth >= MIN_DETECTABLE_VIDEO_DIMENSION_PX &&
            this.videoElement.videoHeight >= MIN_DETECTABLE_VIDEO_DIMENSION_PX
        );
    }

    private scheduleNextPrediction(callback: (detection: Detection[]) => void): void {
        this.predictionFrameId = window.requestAnimationFrame(() => {
            void this.predictCam(callback);
        });
    }

    private handleDetectionRuntimeError(error: unknown): void {
        frontendLogger.error("CharacterGaze FaceDetector failed during video inference.", {
            error,
        });
        const wasDetected = this.detected;
        this.stopPredictionLoop();
        this.detected = false;
        this.lastTargetDebugText = "検出エラー";
        this.keypointSmoother.easeToNeutral();
        if (wasDetected) {
            this.getLeaveCallback()();
            this.videoElement.dispatchEvent(new Event("leave"));
        }
        this.detectionErrorCallback?.(error);
    }

    private handleFrozenVideoFrame(
        nowMs: number,
        callback: (detection: Detection[]) => void,
    ): void {
        if (
            this.lastVideoFrameUpdatedAtMs < 0 ||
            nowMs - this.lastVideoFrameUpdatedAtMs <= VIDEO_FRAME_STALE_MS
        ) {
            return;
        }
        this.lastTargetDebugText = "映像停止";
        this.keypointSmoother.easeToNeutral();
        const newStatus = this.detecting();
        if (this.detected !== newStatus) {
            frontendLogger.debug("Character gaze target left after frozen video frame.");
            this.getLeaveCallback()();
            this.videoElement.dispatchEvent(new Event("leave"));
            this.detected = newStatus;
        }
        callback([]);
    }

    private dispatchPresenceChange(newStatus: boolean): void {
        if (newStatus) {
            frontendLogger.debug("Character gaze target arrived.");
            this.getArriveCallback()();
            this.videoElement.dispatchEvent(new Event("arrive"));
            return;
        }
        frontendLogger.debug("Character gaze target left.");
        this.getLeaveCallback()();
        this.videoElement.dispatchEvent(new Event("leave"));
    }
}
