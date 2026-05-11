import {
    FilesetResolver,
    PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type {
    NormalizedLandmark,
    PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseMotionSnapshot,
} from "./SincroPoseMotionSnapshot";

const MEDIAPIPE_WASM_PATH = "/mediapipe-wasm";
const POSE_LANDMARKER_MODEL_PATH = "/3rd_party/pose_landmarker_lite.task";
const MIN_LANDMARK_VISIBILITY = 0.45;

const LANDMARK = {
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
    leftHip: 23,
    rightHip: 24,
} as const;

type PoseSide = "left" | "right";

// PoseLandmarker の上半身ランドマークを、低振幅 retarget 用の内部 snapshot へ正規化する。
// ここでは高精度IKを狙わず、肩・上腕・前腕が暴れないことを優先して confidence gate を強めに置く。
export class SincroPoseTracker {
    private poseLandmarker: PoseLandmarker | null = null;
    private initPromise: Promise<void> | null = null;
    private lastInferenceEndedAtMs: number | null = null;
    private consecutiveFailures = 0;
    private snapshot: SincroPoseMotionSnapshot = {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
        rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
    };

    async initVision(): Promise<void> {
        if (this.poseLandmarker) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.createPoseLandmarker()
                .catch((error) => {
                    this.initPromise = null;
                    this.snapshot = this.createFallbackSnapshot("PoseLandmarker の初期化に失敗しました。", performance.now());
                    throw error;
                });
        }
        await this.initPromise;
    }

    modelIsLoaded(): boolean {
        return this.poseLandmarker != null;
    }

    detect(videoElement: HTMLVideoElement, timestampMs: number): SincroPoseMotionSnapshot {
        if (!this.poseLandmarker) {
            this.snapshot = this.createFallbackSnapshot("PoseLandmarker model is not loaded.", timestampMs);
            return this.snapshot;
        }

        const inferenceStartedAtMs = performance.now();
        const result = this.poseLandmarker.detectForVideo(videoElement, timestampMs);
        const inferenceEndedAtMs = performance.now();
        const inferenceTimeMs = inferenceEndedAtMs - inferenceStartedAtMs;
        const inferenceFps = this.lastInferenceEndedAtMs == null
            ? 0
            : 1000 / Math.max(1, inferenceEndedAtMs - this.lastInferenceEndedAtMs);
        this.lastInferenceEndedAtMs = inferenceEndedAtMs;
        this.snapshot = this.normalizeResult(result, inferenceTimeMs, inferenceFps, timestampMs);
        return this.getSnapshot();
    }

    getSnapshot(): SincroPoseMotionSnapshot {
        return {
            ...this.snapshot,
            upperBody: { ...this.snapshot.upperBody },
            leftArm: { ...this.snapshot.leftArm },
            rightArm: { ...this.snapshot.rightArm },
        };
    }

    stop(reason: string | null = null, nowMs: number = performance.now()): SincroPoseMotionSnapshot {
        this.snapshot = {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            fallbackReason: reason,
            lastUpdatedAtMs: nowMs,
        };
        this.lastInferenceEndedAtMs = null;
        this.consecutiveFailures = 0;
        return this.getSnapshot();
    }

    dispose(): void {
        this.poseLandmarker?.close();
        this.poseLandmarker = null;
        this.initPromise = null;
        this.stop("PoseLandmarker disposed.");
    }

    private async createPoseLandmarker(): Promise<void> {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
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
            trackingEnabled: true,
            lastUpdatedAtMs: performance.now(),
        };
    }

    private normalizeResult(
        result: PoseLandmarkerResult,
        inferenceTimeMs: number,
        inferenceFps: number,
        nowMs: number,
    ): SincroPoseMotionSnapshot {
        const landmarks = result.landmarks[0] ?? null;
        if (!landmarks) {
            this.consecutiveFailures += 1;
            return {
                ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
                leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                trackingEnabled: true,
                inferenceTimeMs,
                inferenceFps,
                consecutiveFailures: this.consecutiveFailures,
                lastUpdatedAtMs: nowMs,
                fallbackReason: "pose_not_detected",
            };
        }

        const leftShoulder = landmarks[LANDMARK.leftShoulder];
        const rightShoulder = landmarks[LANDMARK.rightShoulder];
        const leftHip = landmarks[LANDMARK.leftHip];
        const rightHip = landmarks[LANDMARK.rightHip];
        const shoulderConfidence = averageVisibility([leftShoulder, rightShoulder]);
        if (shoulderConfidence < MIN_LANDMARK_VISIBILITY) {
            this.consecutiveFailures += 1;
            return {
                ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
                leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                trackingEnabled: true,
                inferenceTimeMs,
                inferenceFps,
                consecutiveFailures: this.consecutiveFailures,
                lastUpdatedAtMs: nowMs,
                fallbackReason: "shoulders_low_confidence",
            };
        }

        this.consecutiveFailures = 0;
        const shoulderWidth = Math.max(distance2d(leftShoulder, rightShoulder), 0.08);
        const shoulderCenterX = (leftShoulder.x + rightShoulder.x) * 0.5;
        const shoulderCenterY = (leftShoulder.y + rightShoulder.y) * 0.5;
        const hipCenterX = visibility(leftHip) >= MIN_LANDMARK_VISIBILITY && visibility(rightHip) >= MIN_LANDMARK_VISIBILITY
            ? (leftHip.x + rightHip.x) * 0.5
            : shoulderCenterX;

        return {
            trackingEnabled: true,
            detected: true,
            confidence: Math.max(
                shoulderConfidence,
                this.armMotion(landmarks, "left", shoulderWidth).confidence,
                this.armMotion(landmarks, "right", shoulderWidth).confidence,
            ),
            upperBody: {
                shoulderRoll: clampSigned((rightShoulder.y - leftShoulder.y) / shoulderWidth),
                torsoLean: clampSigned((hipCenterX - shoulderCenterX) / shoulderWidth),
                shoulderWidth,
                shoulderCenterX,
                shoulderCenterY,
            },
            leftArm: this.armMotion(landmarks, "left", shoulderWidth),
            rightArm: this.armMotion(landmarks, "right", shoulderWidth),
            inferenceTimeMs,
            inferenceFps,
            consecutiveFailures: 0,
            degradedToFaceOnly: false,
            lastUpdatedAtMs: nowMs,
            fallbackReason: null,
        };
    }

    private armMotion(
        landmarks: NormalizedLandmark[],
        side: PoseSide,
        shoulderWidth: number,
    ): SincroPoseArmMotionSnapshot {
        const shoulder = landmarks[side === "left" ? LANDMARK.leftShoulder : LANDMARK.rightShoulder];
        const elbow = landmarks[side === "left" ? LANDMARK.leftElbow : LANDMARK.rightElbow];
        const wrist = landmarks[side === "left" ? LANDMARK.leftWrist : LANDMARK.rightWrist];
        const confidence = averageVisibility([shoulder, elbow, wrist]);
        if (confidence < MIN_LANDMARK_VISIBILITY) {
            return {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
                confidence,
            };
        }

        const sideSign = side === "left" ? -1 : 1;
        const elbowAngle = angleAt(elbow, shoulder, wrist);
        return {
            tracked: true,
            confidence,
            upperArmLift: clampSigned((shoulder.y - elbow.y) / shoulderWidth),
            upperArmOpen: clampSigned(((elbow.x - shoulder.x) * sideSign) / shoulderWidth),
            lowerArmFlex: clamp01(1 - elbowAngle / Math.PI) * 2 - 1,
            wristRaise: clampSigned((elbow.y - wrist.y) / shoulderWidth),
        };
    }

    private createFallbackSnapshot(reason: string, nowMs: number): SincroPoseMotionSnapshot {
        return {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            trackingEnabled: true,
            fallbackReason: reason,
            consecutiveFailures: this.consecutiveFailures,
            lastUpdatedAtMs: nowMs,
        };
    }

    private selectPoseLandmarkerDelegate(): "CPU" | "GPU" {
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }
}

function visibility(landmark: NormalizedLandmark | undefined): number {
    return clamp01(landmark?.visibility ?? 0);
}

function averageVisibility(landmarks: (NormalizedLandmark | undefined)[]): number {
    if (landmarks.length === 0) {
        return 0;
    }
    return landmarks.reduce((sum, landmark) => sum + visibility(landmark), 0) / landmarks.length;
}

function distance2d(a: NormalizedLandmark, b: NormalizedLandmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleAt(center: NormalizedLandmark, a: NormalizedLandmark, b: NormalizedLandmark): number {
    const ax = a.x - center.x;
    const ay = a.y - center.y;
    const bx = b.x - center.x;
    const by = b.y - center.y;
    const magnitude = Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by), 1e-6);
    return Math.acos(clampSigned((ax * bx + ay * by) / magnitude));
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampSigned(value: number): number {
    return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}
