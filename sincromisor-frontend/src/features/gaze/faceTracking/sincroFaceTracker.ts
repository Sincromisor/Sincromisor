import type { Category, FaceLandmarkerResult, Matrix } from "@mediapipe/tasks-vision";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { loadMediaPipeVisionFileset } from "../trackingRuntime/mediaPipeVisionFileset";
import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "./sincroFaceMotionSnapshot";

const FACE_LANDMARKER_MODEL_PATH = "/3rd_party/face_landmarker.task";

// FaceLandmarker の生結果を、VRM retarget が扱いやすい内部 snapshot へ正規化する。
// DOM や UI 更新は持ち込まず、TrackerRuntime から渡された video frame だけを同期推論する。
export class SincroFaceTracker {
    private faceLandmarker?: FaceLandmarker;
    private initPromise?: Promise<void>;
    private lastInferenceEndedAtMs?: number;
    private snapshot: SincroFaceMotionSnapshot = {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    };

    async initVision(): Promise<void> {
        if (this.faceLandmarker) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.createFaceLandmarker().catch((error) => {
                this.initPromise = undefined;
                this.snapshot = this.createFallbackSnapshot(
                    "FaceLandmarker の初期化に失敗しました。",
                    performance.now(),
                );
                throw error;
            });
        }
        await this.initPromise;
    }

    modelIsLoaded(): boolean {
        return this.faceLandmarker !== undefined;
    }

    detect(videoFrame: TexImageSource, timestampMs: number): SincroFaceMotionSnapshot {
        if (!this.faceLandmarker) {
            this.snapshot = this.createFallbackSnapshot(
                "FaceLandmarker model is not loaded.",
                timestampMs,
            );
            return this.snapshot;
        }

        const inferenceStartedAtMs = performance.now();
        const result = this.faceLandmarker.detectForVideo(videoFrame, timestampMs);
        const inferenceEndedAtMs = performance.now();
        const inferenceTimeMs = inferenceEndedAtMs - inferenceStartedAtMs;
        const inferenceFps =
            this.lastInferenceEndedAtMs === undefined
                ? 0
                : 1000 / Math.max(1, inferenceEndedAtMs - this.lastInferenceEndedAtMs);
        this.lastInferenceEndedAtMs = inferenceEndedAtMs;
        this.snapshot = this.normalizeResult(result, inferenceTimeMs, inferenceFps, timestampMs);
        return this.snapshot;
    }

    getSnapshot(): SincroFaceMotionSnapshot {
        return {
            ...this.snapshot,
            headPose: { ...this.snapshot.headPose },
            blendshapes: { ...this.snapshot.blendshapes },
        };
    }

    stop(
        reason: string | undefined = undefined,
        nowMs: number = performance.now(),
    ): SincroFaceMotionSnapshot {
        this.snapshot = {
            ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
            fallbackReason: reason,
            lastUpdatedAtMs: nowMs,
        };
        this.lastInferenceEndedAtMs = undefined;
        return this.getSnapshot();
    }

    dispose(): void {
        this.faceLandmarker?.close();
        this.faceLandmarker = undefined;
        this.initPromise = undefined;
        this.stop("FaceLandmarker disposed.");
    }

    private async createFaceLandmarker(): Promise<void> {
        const vision = await loadMediaPipeVisionFileset();
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: FACE_LANDMARKER_MODEL_PATH,
                delegate: this.selectFaceLandmarkerDelegate(),
            },
            runningMode: "VIDEO",
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
        });
        this.snapshot = {
            ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
            trackingEnabled: true,
            lastUpdatedAtMs: performance.now(),
        };
    }

    private normalizeResult(
        result: FaceLandmarkerResult,
        inferenceTimeMs: number,
        inferenceFps: number,
        nowMs: number,
    ): SincroFaceMotionSnapshot {
        const detected = result.faceLandmarks.length > 0;
        if (!detected) {
            return {
                ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
                trackingEnabled: true,
                inferenceTimeMs,
                inferenceFps,
                lastUpdatedAtMs: nowMs,
                fallbackReason: "face_not_detected",
            };
        }

        const blendshapes = this.normalizeBlendshapes(result.faceBlendshapes[0]?.categories ?? []);
        const matrix = result.facialTransformationMatrixes[0];
        return {
            trackingEnabled: true,
            detected,
            confidence: this.estimateConfidence(blendshapes),
            headPose: this.normalizeHeadPose(matrix),
            blendshapes,
            inferenceTimeMs,
            inferenceFps,
            lastUpdatedAtMs: nowMs,
        };
    }

    private normalizeBlendshapes(categories: Category[]): Record<string, number> {
        const values: Record<string, number> = {};
        for (const category of categories) {
            if (!category.categoryName) {
                continue;
            }
            values[category.categoryName] = this.clamp01(category.score);
        }
        return values;
    }

    private normalizeHeadPose(matrix: Matrix | undefined) {
        const values = matrix?.data?.length === 16 ? matrix.data : undefined;
        if (values === undefined) {
            return {
                yawDeg: 0,
                pitchDeg: 0,
                rollDeg: 0,
            };
        }

        // MediaPipe の facial transformation matrix から回転成分だけを取り出す。
        // 初期 retarget では符号補正を上位で調整しやすいよう、度数法の素直な Euler 角で保持する。
        const r00 = values[0];
        const r10 = values[4];
        const r11 = values[5];
        const r12 = values[6];
        const r20 = values[8];
        const r21 = values[9];
        const r22 = values[10];
        const sy = Math.sqrt(r00 * r00 + r10 * r10);
        const singular = sy < 1e-6;
        const pitchRad = singular ? Math.atan2(-r12, r11) : Math.atan2(r21, r22);
        const yawRad = Math.atan2(-r20, sy);
        const rollRad = singular ? 0 : Math.atan2(r10, r00);
        return {
            yawDeg: this.radToDeg(yawRad),
            pitchDeg: this.radToDeg(pitchRad),
            rollDeg: this.radToDeg(rollRad),
            matrix: [...values],
        };
    }

    private estimateConfidence(blendshapes: Record<string, number>): number {
        const scores = Object.values(blendshapes);
        if (scores.length === 0) {
            return 1;
        }
        return this.clamp01(Math.max(...scores));
    }

    private createFallbackSnapshot(reason: string, nowMs: number): SincroFaceMotionSnapshot {
        return {
            ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
            trackingEnabled: true,
            fallbackReason: reason,
            lastUpdatedAtMs: nowMs,
        };
    }

    private selectFaceLandmarkerDelegate(): "CPU" | "GPU" {
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    }

    private radToDeg(value: number): number {
        return value * (180 / Math.PI);
    }
}
