import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroFaceMotionSnapshot } from "../../faceTracking/sincroFaceMotionSnapshot";
import { retargetSincroFaceExpressions } from "./sincroFaceExpressionRetargeter";
import { retargetSincroFaceHeadPose } from "./sincroFaceHeadRetargeter";
import {
    cloneSincroFaceHead,
    lerp,
    smoothingAlpha,
    smoothSincroFaceExpressions,
    smoothSincroFaceHead,
} from "./sincroFaceRetargetMath";
import {
    DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
    NEUTRAL_SINCRO_FACE_EXPRESSIONS,
    NEUTRAL_SINCRO_FACE_HEAD,
    type SincroFaceNeutralPose,
    type SincroFaceRetargetConfig,
    type SincroFaceRetargetedExpressions,
    type SincroFaceRetargetedHeadPose,
    type SincroFaceRetargetFrame,
} from "./sincroFaceRetargetTypes";

export type {
    SincroFaceNeutralPose,
    SincroFaceRetargetConfig,
    SincroFaceRetargetedExpressions,
    SincroFaceRetargetedHeadPose,
    SincroFaceRetargetFrame,
    SincroFaceRotation,
} from "./sincroFaceRetargetTypes";
export {
    DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
    retargetSincroFaceExpressions,
    retargetSincroFaceHeadPose,
};

type SmoothFrameOptions = {
    active: boolean;
    confidence: number;
    targetHead: SincroFaceRetargetedHeadPose;
    targetExpressions: SincroFaceRetargetedExpressions;
    deltaMs: number;
    headTimeConstantMs?: number;
};

// MediaPipe snapshot から VRM に渡せる値へ変換する stateful retargeter。
// calibration と smoothing をここに閉じ込め、VRM controller が MediaPipe 名や軸補正を知らない構造にする。
export class SincroFaceRetargeter {
    private readonly config: SincroFaceRetargetConfig;
    private neutralPose?: SincroFaceNeutralPose;
    private neutralStartedAtMs?: number;
    private lastUpdateAtMs?: number;
    private smoothedHead: SincroFaceRetargetedHeadPose =
        cloneSincroFaceHead(NEUTRAL_SINCRO_FACE_HEAD);
    private smoothedExpressions: SincroFaceRetargetedExpressions = {
        ...NEUTRAL_SINCRO_FACE_EXPRESSIONS,
    };

    constructor(config: Partial<SincroFaceRetargetConfig> = {}) {
        this.config = {
            ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
            ...config,
            headInputScale: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.headInputScale,
                ...config.headInputScale,
            },
            maxHeadDeg: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.maxHeadDeg,
                ...config.maxHeadDeg,
            },
            headBoneWeights: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.headBoneWeights,
                ...config.headBoneWeights,
            },
            blinkCalibration: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.blinkCalibration,
                ...config.blinkCalibration,
            },
        };
    }

    retarget(snapshot: SincroFaceMotionSnapshot, nowMs: number): SincroFaceRetargetFrame {
        const deltaMs =
            this.lastUpdateAtMs === undefined
                ? 1000 / 60
                : MathUtils.clamp(nowMs - this.lastUpdateAtMs, 1, 100);
        this.lastUpdateAtMs = nowMs;

        if (!this.snapshotIsUsable(snapshot)) {
            this.neutralStartedAtMs = undefined;
            return this.smoothFrame({
                active: false,
                confidence: 0,
                targetHead: NEUTRAL_SINCRO_FACE_HEAD,
                targetExpressions: NEUTRAL_SINCRO_FACE_EXPRESSIONS,
                deltaMs,
                headTimeConstantMs: this.config.returnToNeutralMs,
            });
        }

        this.updateNeutral(snapshot, nowMs);
        const targetHead = retargetSincroFaceHeadPose(snapshot, this.neutralPose, this.config);
        const targetExpressions = retargetSincroFaceExpressions(snapshot.blendshapes, this.config);
        return this.smoothFrame({
            active: true,
            confidence: snapshot.confidence,
            targetHead,
            targetExpressions,
            deltaMs,
        });
    }

    reset(): void {
        this.neutralPose = undefined;
        this.neutralStartedAtMs = undefined;
        this.lastUpdateAtMs = undefined;
        this.smoothedHead = cloneSincroFaceHead(NEUTRAL_SINCRO_FACE_HEAD);
        this.smoothedExpressions = { ...NEUTRAL_SINCRO_FACE_EXPRESSIONS };
    }

    private snapshotIsUsable(snapshot: SincroFaceMotionSnapshot): boolean {
        return (
            snapshot.trackingEnabled &&
            snapshot.detected &&
            snapshot.confidence >= this.config.minConfidence
        );
    }

    private updateNeutral(snapshot: SincroFaceMotionSnapshot, nowMs: number): void {
        if (this.neutralStartedAtMs === undefined) {
            this.neutralStartedAtMs = nowMs;
            this.neutralPose = {
                yawDeg: snapshot.headPose.yawDeg,
                pitchDeg: snapshot.headPose.pitchDeg,
                rollDeg: snapshot.headPose.rollDeg,
            };
            return;
        }
        if (
            this.neutralPose === undefined ||
            nowMs - this.neutralStartedAtMs >= this.config.neutralLearningMs
        ) {
            return;
        }

        const alpha = MathUtils.clamp(
            (nowMs - this.neutralStartedAtMs) / this.config.neutralLearningMs,
            0.08,
            0.35,
        );
        const currentNeutralPose = this.neutralPose;
        this.neutralPose = {
            yawDeg: lerp(currentNeutralPose.yawDeg, snapshot.headPose.yawDeg, alpha),
            pitchDeg: lerp(currentNeutralPose.pitchDeg, snapshot.headPose.pitchDeg, alpha),
            rollDeg: lerp(currentNeutralPose.rollDeg, snapshot.headPose.rollDeg, alpha),
        };
    }

    private smoothFrame(options: SmoothFrameOptions): SincroFaceRetargetFrame {
        const headTimeConstantMs = options.headTimeConstantMs ?? this.config.headSmoothingMs;
        const { active, confidence, targetHead, targetExpressions, deltaMs } = options;
        const headAlpha = smoothingAlpha(deltaMs, headTimeConstantMs);
        const expressionAlpha = smoothingAlpha(deltaMs, this.config.expressionSmoothingMs);
        this.smoothedHead = smoothSincroFaceHead(this.smoothedHead, targetHead, headAlpha);
        this.smoothedExpressions = smoothSincroFaceExpressions(
            this.smoothedExpressions,
            targetExpressions,
            expressionAlpha,
        );
        return {
            active,
            confidence,
            head: cloneSincroFaceHead(this.smoothedHead),
            expressions: { ...this.smoothedExpressions },
        };
    }
}
