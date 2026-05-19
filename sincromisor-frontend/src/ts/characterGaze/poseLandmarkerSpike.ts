import type { FaceLandmarkerResult, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { loadMediaPipeVisionFileset } from "../faceTracking/mediaPipeVisionFileset";
import {
    averageSample,
    extractTrackedLandmarks,
    poseLandmarkerDetected,
} from "./poseLandmarkerSpikeMetrics";
import {
    DEFAULT_FACE_LANDMARKER_MODEL_PATH,
    DEFAULT_POSE_LANDMARKER_SPIKE_CONFIG,
    MIN_VIDEO_DIMENSION_PX,
    POSE_LANDMARKER_SPIKE_MODEL_PATHS,
    type PoseLandmarkerSpikeCallbacks,
    type PoseLandmarkerSpikeConfig,
    type PoseLandmarkerSpikeMetrics,
    type PoseLandmarkerSpikeModelPreset,
    type PoseLandmarkerSpikeTrackedLandmark,
    SAMPLE_WINDOW_SIZE,
} from "./poseLandmarkerSpikeTypes";

export {
    DEFAULT_POSE_LANDMARKER_SPIKE_CONFIG,
    POSE_LANDMARKER_SPIKE_MODEL_PATHS,
    type PoseLandmarkerSpikeConfig,
    type PoseLandmarkerSpikeMetrics,
    type PoseLandmarkerSpikeModelPreset,
    type PoseLandmarkerSpikeTrackedLandmark,
};

// PoseLandmarker の同期 video 推論が main thread に与える影響を切り分けるための検証専用 runner。
// 本番の TrackerRuntime とは接続せず、camera/video ownership と metrics 計測をここへ閉じ込める。
export class PoseLandmarkerSpike {
    private readonly videoElement: HTMLVideoElement;
    private readonly callbacks: PoseLandmarkerSpikeCallbacks;
    private poseLandmarker?: PoseLandmarker;
    private faceLandmarker?: FaceLandmarker;
    private stream?: MediaStream;
    private config: PoseLandmarkerSpikeConfig = { ...DEFAULT_POSE_LANDMARKER_SPIKE_CONFIG };
    private loopEnabled = false;
    private animationFrameId?: number;
    private lastInferenceAtMs = -1;
    private lastPoseInferenceEndedAtMs?: number;
    private lastRenderFrameAtMs?: number;
    private renderFps = 0;
    private poseSamples: number[] = [];
    private faceSamples: number[] = [];
    private fallbackReason?: string;

    constructor(videoElement: HTMLVideoElement, callbacks: PoseLandmarkerSpikeCallbacks) {
        this.videoElement = videoElement;
        this.callbacks = callbacks;
    }

    async start(config: PoseLandmarkerSpikeConfig): Promise<void> {
        this.stopLoop();
        this.disposeLandmarkers();
        this.config = this.normalizeConfig(config);
        this.poseSamples = [];
        this.faceSamples = [];
        this.lastInferenceAtMs = -1;
        this.lastPoseInferenceEndedAtMs = undefined;
        this.fallbackReason = undefined;
        this.callbacks.onStatus("MediaPipe vision runtime を初期化しています。");
        const vision = await loadMediaPipeVisionFileset();
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: this.config.modelAssetPath,
                delegate: this.config.delegate,
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
        });
        if (this.config.runFaceLandmarker) {
            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        this.config.faceModelAssetPath ?? DEFAULT_FACE_LANDMARKER_MODEL_PATH,
                    delegate: this.config.delegate,
                },
                runningMode: "VIDEO",
                numFaces: 1,
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
            });
        }
        await this.startCamera();
        this.loopEnabled = true;
        this.callbacks.onStatus("PoseLandmarker spike を実行中です。");
        this.scheduleNextFrame();
    }

    stop(reason: string | undefined = "pose_landmarker_spike_stopped"): void {
        this.stopLoop();
        this.disposeLandmarkers();
        this.stopCamera();
        this.fallbackReason = reason;
        this.callbacks.onPoseResult(undefined);
        this.callbacks.onStatus("PoseLandmarker spike を停止しました。");
    }

    updateTargetInferenceFps(targetInferenceFps: number): void {
        this.config = this.normalizeConfig({
            ...this.config,
            targetInferenceFps,
        });
    }

    private async startCamera(): Promise<void> {
        if (!this.stream) {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user",
                },
            });
        }
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
    }

    private stopCamera(): void {
        this.videoElement.pause();
        this.videoElement.srcObject = null;
        this.stream?.getTracks().forEach((track) => {
            track.stop();
        });
        this.stream = undefined;
    }

    private scheduleNextFrame(): void {
        this.animationFrameId = window.requestAnimationFrame((nowMs) => {
            this.animationFrameId = undefined;
            this.updateRenderFps(nowMs);
            this.runFrame(nowMs);
        });
    }

    private runFrame(nowMs: number): void {
        if (!this.loopEnabled) {
            return;
        }
        if (!this.videoIsReady()) {
            this.scheduleNextFrame();
            return;
        }
        if (!this.shouldRunInference(nowMs)) {
            this.scheduleNextFrame();
            return;
        }

        this.lastInferenceAtMs = nowMs;
        try {
            const poseResult = this.detectPose(nowMs);
            this.detectFace(nowMs);
            this.callbacks.onPoseResult(poseResult);
            this.callbacks.onMetrics(this.createMetrics(poseResult));
        } catch (error) {
            this.fallbackReason = this.formatError(error);
            this.callbacks.onError(error);
            this.stopLoop();
            return;
        }
        this.scheduleNextFrame();
    }

    private detectPose(timestampMs: number): PoseLandmarkerResult {
        if (!this.poseLandmarker) {
            throw new Error("PoseLandmarker is not initialized.");
        }
        const startedAtMs = performance.now();
        const result = this.poseLandmarker.detectForVideo(this.videoElement, timestampMs);
        const endedAtMs = performance.now();
        this.pushSample(this.poseSamples, endedAtMs - startedAtMs);
        this.lastPoseInferenceEndedAtMs = endedAtMs;
        return result;
    }

    private detectFace(timestampMs: number): FaceLandmarkerResult | undefined {
        if (!this.faceLandmarker) {
            return undefined;
        }
        const startedAtMs = performance.now();
        const result = this.faceLandmarker.detectForVideo(this.videoElement, timestampMs);
        const endedAtMs = performance.now();
        this.pushSample(this.faceSamples, endedAtMs - startedAtMs);
        return result;
    }

    private createMetrics(poseResult: PoseLandmarkerResult): PoseLandmarkerSpikeMetrics {
        const currentPoseSample = this.poseSamples[this.poseSamples.length - 1] ?? 0;
        const currentFaceSample = this.faceSamples[this.faceSamples.length - 1];
        return {
            poseInferenceMs: currentPoseSample,
            poseInferenceAvgMs: this.average(this.poseSamples),
            poseInferenceMaxMs: Math.max(...this.poseSamples, 0),
            poseInferenceFps: this.estimatePoseInferenceFps(),
            faceInferenceMs: currentFaceSample,
            faceInferenceAvgMs:
                this.faceSamples.length > 0 ? averageSample(this.faceSamples) : undefined,
            renderFps: this.renderFps,
            droppedVideoFrames: this.readDroppedVideoFrames(),
            detected: poseLandmarkerDetected(poseResult),
            poseCount: poseResult.landmarks.length,
            trackedLandmarks: extractTrackedLandmarks(poseResult.landmarks[0] ?? []),
            fallbackReason: this.fallbackReason,
        };
    }

    private shouldRunInference(nowMs: number): boolean {
        if (this.lastInferenceAtMs < 0) {
            return true;
        }
        return nowMs - this.lastInferenceAtMs >= 1000 / this.config.targetInferenceFps;
    }

    private videoIsReady(): boolean {
        return (
            this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            this.videoElement.videoWidth >= MIN_VIDEO_DIMENSION_PX &&
            this.videoElement.videoHeight >= MIN_VIDEO_DIMENSION_PX
        );
    }

    private updateRenderFps(nowMs: number): void {
        if (this.lastRenderFrameAtMs !== undefined) {
            const instantFps = 1000 / Math.max(1, nowMs - this.lastRenderFrameAtMs);
            this.renderFps =
                this.renderFps === 0 ? instantFps : this.renderFps * 0.9 + instantFps * 0.1;
        }
        this.lastRenderFrameAtMs = nowMs;
    }

    private estimatePoseInferenceFps(): number {
        if (this.lastPoseInferenceEndedAtMs === undefined || this.lastInferenceAtMs < 0) {
            return 0;
        }
        return Math.min(
            this.config.targetInferenceFps,
            1000 / Math.max(1, performance.now() - this.lastInferenceAtMs),
        );
    }

    private readDroppedVideoFrames(): number | undefined {
        if (
            "getVideoPlaybackQuality" in this.videoElement &&
            typeof this.videoElement.getVideoPlaybackQuality === "function"
        ) {
            return this.videoElement.getVideoPlaybackQuality().droppedVideoFrames;
        }
        return undefined;
    }

    private pushSample(samples: number[], value: number): void {
        samples.push(value);
        if (samples.length > SAMPLE_WINDOW_SIZE) {
            samples.shift();
        }
    }

    private average(samples: number[]): number {
        if (samples.length === 0) {
            return 0;
        }
        return averageSample(samples);
    }

    private normalizeConfig(config: PoseLandmarkerSpikeConfig): PoseLandmarkerSpikeConfig {
        const targetInferenceFps = Math.max(1, Math.min(30, Math.round(config.targetInferenceFps)));
        return {
            ...config,
            targetInferenceFps,
            modelAssetPath: config.modelAssetPath.trim(),
            faceModelAssetPath:
                config.faceModelAssetPath?.trim() === ""
                    ? DEFAULT_FACE_LANDMARKER_MODEL_PATH
                    : (config.faceModelAssetPath?.trim() ?? DEFAULT_FACE_LANDMARKER_MODEL_PATH),
        };
    }

    private stopLoop(): void {
        this.loopEnabled = false;
        if (this.animationFrameId !== undefined) {
            window.cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = undefined;
        }
    }

    private disposeLandmarkers(): void {
        this.poseLandmarker?.close();
        this.faceLandmarker?.close();
        this.poseLandmarker = undefined;
        this.faceLandmarker = undefined;
    }

    private formatError(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
