import type { Landmark, NormalizedLandmark, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { loadMediaPipeVisionFileset } from "./MediaPipeVisionFileset";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseLowerBodyTargetSnapshot,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "./SincroPoseMotionSnapshot";
import {
    createSincroPoseTargetPoint,
    type PoseTargetPointOrigin,
    type PoseWorldTargetOrigin,
    poseLandmarkVisibility,
    SINCRO_POSE_MIN_LANDMARK_VISIBILITY,
} from "./sincroPoseTargetPoint";

const POSE_LANDMARKER_MODEL_PATH = "/3rd_party/pose_landmarker_lite.task";

const LANDMARK = {
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
    leftHip: 23,
    rightHip: 24,
    leftKnee: 25,
    rightKnee: 26,
    leftAnkle: 27,
    rightAnkle: 28,
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
        lowerBodyTargets: cloneLowerBodyTargets(DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT),
    };

    async initVision(): Promise<void> {
        if (this.poseLandmarker) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.createPoseLandmarker().catch((error) => {
                this.initPromise = null;
                this.snapshot = this.createFallbackSnapshot(
                    "PoseLandmarker の初期化に失敗しました。",
                    performance.now(),
                );
                throw error;
            });
        }
        await this.initPromise;
    }

    modelIsLoaded(): boolean {
        return this.poseLandmarker != null;
    }

    detect(videoFrame: TexImageSource, timestampMs: number): SincroPoseMotionSnapshot {
        if (!this.poseLandmarker) {
            this.snapshot = this.createFallbackSnapshot(
                "PoseLandmarker model is not loaded.",
                timestampMs,
            );
            return this.snapshot;
        }

        const inferenceStartedAtMs = performance.now();
        const result = this.poseLandmarker.detectForVideo(videoFrame, timestampMs);
        const inferenceEndedAtMs = performance.now();
        const inferenceTimeMs = inferenceEndedAtMs - inferenceStartedAtMs;
        const inferenceFps =
            this.lastInferenceEndedAtMs == null
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
            leftArm: cloneArmSnapshot(this.snapshot.leftArm),
            rightArm: cloneArmSnapshot(this.snapshot.rightArm),
            lowerBodyTargets: cloneLowerBodyTargets(this.snapshot.lowerBodyTargets),
        };
    }

    stop(
        reason: string | null = null,
        nowMs: number = performance.now(),
    ): SincroPoseMotionSnapshot {
        this.snapshot = {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            lowerBodyTargets: cloneLowerBodyTargets(DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT),
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
            lowerBodyTargets: cloneLowerBodyTargets(DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT),
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
        const worldLandmarks = result.worldLandmarks[0] ?? null;
        if (!landmarks) {
            this.consecutiveFailures += 1;
            return {
                ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
                leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                lowerBodyTargets: cloneLowerBodyTargets(
                    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
                ),
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
        if (shoulderConfidence < SINCRO_POSE_MIN_LANDMARK_VISIBILITY) {
            this.consecutiveFailures += 1;
            return {
                ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
                leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
                lowerBodyTargets: cloneLowerBodyTargets(
                    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
                ),
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
        const hipCenterTracked =
            poseLandmarkVisibility(leftHip) >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY &&
            poseLandmarkVisibility(rightHip) >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY;
        const hipCenterX = hipCenterTracked ? (leftHip.x + rightHip.x) * 0.5 : shoulderCenterX;
        const hipCenterY = hipCenterTracked ? (leftHip.y + rightHip.y) * 0.5 : shoulderCenterY;
        const worldOrigins = createWorldTargetOrigins(worldLandmarks);
        const shoulderImageOrigin = {
            imageScale: shoulderWidth,
            anchorX: shoulderCenterX,
            anchorY: shoulderCenterY,
        };
        const hipsImageOrigin = {
            imageScale: shoulderWidth,
            anchorX: hipCenterX,
            anchorY: hipCenterY,
        };
        const leftArm = this.armMotion(
            landmarks,
            worldLandmarks,
            "left",
            shoulderImageOrigin,
            worldOrigins.shoulders,
        );
        const rightArm = this.armMotion(
            landmarks,
            worldLandmarks,
            "right",
            shoulderImageOrigin,
            worldOrigins.shoulders,
        );
        const lowerBodyTargets = this.lowerBodyTargets(
            landmarks,
            worldLandmarks,
            hipsImageOrigin,
            worldOrigins.hips,
        );

        return {
            trackingEnabled: true,
            detected: true,
            confidence: Math.max(shoulderConfidence, leftArm.confidence, rightArm.confidence),
            upperBody: {
                shoulderRoll: clampSigned((rightShoulder.y - leftShoulder.y) / shoulderWidth),
                torsoLean: clampSigned((hipCenterX - shoulderCenterX) / shoulderWidth),
                shoulderWidth,
                shoulderCenterX,
                shoulderCenterY,
                hipCenterTracked,
            },
            leftArm,
            rightArm,
            lowerBodyTargets,
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
        worldLandmarks: Landmark[] | null,
        side: PoseSide,
        imageOrigin: PoseTargetPointOrigin,
        worldOrigin: PoseWorldTargetOrigin | null,
    ): SincroPoseArmMotionSnapshot {
        const shoulder =
            landmarks[side === "left" ? LANDMARK.leftShoulder : LANDMARK.rightShoulder];
        const elbow = landmarks[side === "left" ? LANDMARK.leftElbow : LANDMARK.rightElbow];
        const wrist = landmarks[side === "left" ? LANDMARK.leftWrist : LANDMARK.rightWrist];
        const worldShoulder =
            worldLandmarks?.[side === "left" ? LANDMARK.leftShoulder : LANDMARK.rightShoulder];
        const worldElbow =
            worldLandmarks?.[side === "left" ? LANDMARK.leftElbow : LANDMARK.rightElbow];
        const worldWrist =
            worldLandmarks?.[side === "left" ? LANDMARK.leftWrist : LANDMARK.rightWrist];
        const confidence = averageVisibility([shoulder, elbow, wrist]);
        const targets = {
            shoulder: createSincroPoseTargetPoint(
                shoulder,
                worldShoulder,
                "shoulder",
                imageOrigin,
                worldOrigin,
            ),
            elbow: createSincroPoseTargetPoint(
                elbow,
                worldElbow,
                "elbow",
                imageOrigin,
                worldOrigin,
            ),
            wrist: createSincroPoseTargetPoint(
                wrist,
                worldWrist,
                "wrist",
                imageOrigin,
                worldOrigin,
            ),
        };
        if (confidence < SINCRO_POSE_MIN_LANDMARK_VISIBILITY) {
            return {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
                confidence,
                targets,
            };
        }

        const sideSign = side === "left" ? -1 : 1;
        const elbowAngle = angleAt(elbow, shoulder, wrist);
        return {
            tracked: true,
            confidence,
            upperArmLift: clampSigned((shoulder.y - elbow.y) / imageOrigin.imageScale),
            upperArmOpen: clampSigned(((elbow.x - shoulder.x) * sideSign) / imageOrigin.imageScale),
            lowerArmFlex: clamp01(1 - elbowAngle / Math.PI) * 2 - 1,
            wristRaise: clampSigned((elbow.y - wrist.y) / imageOrigin.imageScale),
            targets,
        };
    }

    private lowerBodyTargets(
        landmarks: NormalizedLandmark[],
        worldLandmarks: Landmark[] | null,
        imageOrigin: PoseTargetPointOrigin,
        worldOrigin: PoseWorldTargetOrigin | null,
    ): SincroPoseLowerBodyTargetSnapshot {
        return {
            leftHip: createSincroPoseTargetPoint(
                landmarks[LANDMARK.leftHip],
                worldLandmarks?.[LANDMARK.leftHip],
                "hip",
                imageOrigin,
                worldOrigin,
            ),
            rightHip: createSincroPoseTargetPoint(
                landmarks[LANDMARK.rightHip],
                worldLandmarks?.[LANDMARK.rightHip],
                "hip",
                imageOrigin,
                worldOrigin,
            ),
            leftKnee: createSincroPoseTargetPoint(
                landmarks[LANDMARK.leftKnee],
                worldLandmarks?.[LANDMARK.leftKnee],
                "knee",
                imageOrigin,
                worldOrigin,
            ),
            rightKnee: createSincroPoseTargetPoint(
                landmarks[LANDMARK.rightKnee],
                worldLandmarks?.[LANDMARK.rightKnee],
                "knee",
                imageOrigin,
                worldOrigin,
            ),
            leftAnkle: createSincroPoseTargetPoint(
                landmarks[LANDMARK.leftAnkle],
                worldLandmarks?.[LANDMARK.leftAnkle],
                "ankle",
                imageOrigin,
                worldOrigin,
            ),
            rightAnkle: createSincroPoseTargetPoint(
                landmarks[LANDMARK.rightAnkle],
                worldLandmarks?.[LANDMARK.rightAnkle],
                "ankle",
                imageOrigin,
                worldOrigin,
            ),
        };
    }

    private createFallbackSnapshot(reason: string, nowMs: number): SincroPoseMotionSnapshot {
        return {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
            lowerBodyTargets: cloneLowerBodyTargets(DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT),
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

function averageVisibility(landmarks: (NormalizedLandmark | undefined)[]): number {
    if (landmarks.length === 0) {
        return 0;
    }
    return (
        landmarks.reduce((sum, landmark) => sum + poseLandmarkVisibility(landmark), 0) /
        landmarks.length
    );
}

function distance2d(a: NormalizedLandmark, b: NormalizedLandmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3d(a: Landmark, b: Landmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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

function cloneTargetPoint(snapshot: SincroPoseTargetPointSnapshot): SincroPoseTargetPointSnapshot {
    return {
        ...snapshot,
        world: { ...snapshot.world },
    };
}

function cloneArmSnapshot(snapshot: SincroPoseArmMotionSnapshot): SincroPoseArmMotionSnapshot {
    return {
        ...snapshot,
        targets: {
            shoulder: cloneTargetPoint(snapshot.targets.shoulder),
            elbow: cloneTargetPoint(snapshot.targets.elbow),
            wrist: cloneTargetPoint(snapshot.targets.wrist),
        },
    };
}

function cloneLowerBodyTargets(
    snapshot: SincroPoseLowerBodyTargetSnapshot,
): SincroPoseLowerBodyTargetSnapshot {
    return {
        leftHip: cloneTargetPoint(snapshot.leftHip),
        rightHip: cloneTargetPoint(snapshot.rightHip),
        leftKnee: cloneTargetPoint(snapshot.leftKnee),
        rightKnee: cloneTargetPoint(snapshot.rightKnee),
        leftAnkle: cloneTargetPoint(snapshot.leftAnkle),
        rightAnkle: cloneTargetPoint(snapshot.rightAnkle),
    };
}

function createWorldTargetOrigins(worldLandmarks: Landmark[] | null): {
    shoulders: PoseWorldTargetOrigin | null;
    hips: PoseWorldTargetOrigin | null;
} {
    const leftShoulder = worldLandmarks?.[LANDMARK.leftShoulder];
    const rightShoulder = worldLandmarks?.[LANDMARK.rightShoulder];
    const leftHip = worldLandmarks?.[LANDMARK.leftHip];
    const rightHip = worldLandmarks?.[LANDMARK.rightHip];
    const shoulderScale =
        leftShoulder && rightShoulder ? finiteDistance3d(leftShoulder, rightShoulder) : null;
    const hipScale = leftHip && rightHip ? finiteDistance3d(leftHip, rightHip) : null;
    const scale = shoulderScale ?? hipScale ?? null;

    return {
        shoulders:
            leftShoulder && rightShoulder && scale
                ? createWorldTargetOrigin("shoulder_center", leftShoulder, rightShoulder, scale)
                : null,
        hips:
            leftHip && rightHip && scale
                ? createWorldTargetOrigin("hips_center", leftHip, rightHip, scale)
                : null,
    };
}

function createWorldTargetOrigin(
    anchor: PoseWorldTargetOrigin["anchor"],
    left: Landmark,
    right: Landmark,
    scale: number,
): PoseWorldTargetOrigin | null {
    if (!landmark3dIsFinite(left) || !landmark3dIsFinite(right) || scale <= 0) {
        return null;
    }
    return {
        anchor,
        anchorX: (left.x + right.x) * 0.5,
        anchorY: (left.y + right.y) * 0.5,
        anchorZ: (left.z + right.z) * 0.5,
        scale,
    };
}

function finiteDistance3d(a: Landmark, b: Landmark): number | null {
    if (!landmark3dIsFinite(a) || !landmark3dIsFinite(b)) {
        return null;
    }
    const distance = distance3d(a, b);
    return distance > 1e-4 ? distance : null;
}

function landmark3dIsFinite(landmark: Landmark): boolean {
    return (
        Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && Number.isFinite(landmark.z)
    );
}
