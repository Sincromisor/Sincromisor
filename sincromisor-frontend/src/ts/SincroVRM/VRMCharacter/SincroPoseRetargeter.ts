import { MathUtils } from "three/src/math/MathUtils.js";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
} from "../../FaceTracking/SincroPoseMotionSnapshot";

export type SincroPoseRetargetedArm = {
    active: boolean;
    upperArm: { x: number; y: number; z: number };
    lowerArm: { x: number; y: number; z: number };
    wrist: { x: number; y: number; z: number };
};

export type SincroPoseRetargetFrame = {
    active: boolean;
    confidence: number;
    upperBody: {
        spine: { x: number; y: number; z: number };
        chest: { x: number; y: number; z: number };
        leftShoulder: { x: number; y: number; z: number };
        rightShoulder: { x: number; y: number; z: number };
    };
    leftArm: SincroPoseRetargetedArm;
    rightArm: SincroPoseRetargetedArm;
};

export type SincroPoseRetargetConfig = {
    intensityScale: number;
    minConfidence: number;
    returnToNeutralMs: number;
    smoothingMs: number;
    torsoLeanRad: number;
    shoulderRollRad: number;
    shoulderLiftRad: number;
    upperArmLiftRad: number;
    upperArmOpenRad: number;
    lowerArmFlexRad: number;
    wristRaiseRad: number;
};

export const DEFAULT_SINCRO_POSE_RETARGET_CONFIG: SincroPoseRetargetConfig = {
    intensityScale: 0.68,
    minConfidence: 0.45,
    returnToNeutralMs: 520,
    smoothingMs: 155,
    torsoLeanRad: MathUtils.degToRad(2.2),
    shoulderRollRad: MathUtils.degToRad(1.6),
    shoulderLiftRad: MathUtils.degToRad(1.4),
    upperArmLiftRad: MathUtils.degToRad(5.0),
    upperArmOpenRad: MathUtils.degToRad(4.2),
    lowerArmFlexRad: MathUtils.degToRad(5.4),
    wristRaiseRad: MathUtils.degToRad(2.2),
};

const NEUTRAL_POSE_FRAME: SincroPoseRetargetFrame = {
    active: false,
    confidence: 0,
    upperBody: {
        spine: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
    },
    leftArm: {
        active: false,
        upperArm: { x: 0, y: 0, z: 0 },
        lowerArm: { x: 0, y: 0, z: 0 },
        wrist: { x: 0, y: 0, z: 0 },
    },
    rightArm: {
        active: false,
        upperArm: { x: 0, y: 0, z: 0 },
        lowerArm: { x: 0, y: 0, z: 0 },
        wrist: { x: 0, y: 0, z: 0 },
    },
};

// Pose同期はまだoptionalなので、低振幅・強いsmoothingでVRM向け値へ変換する。
// 腕が画面外へ出た時は部位単位で neutral に戻し、face-only の同期を邪魔しない。
export class SincroPoseRetargeter {
    private config: SincroPoseRetargetConfig;
    private lastUpdateAtMs: number | null = null;
    private smoothedFrame: SincroPoseRetargetFrame = cloneFrame(NEUTRAL_POSE_FRAME);

    constructor(config: Partial<SincroPoseRetargetConfig> = {}) {
        this.config = {
            ...DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
            ...config,
        };
    }

    setConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.config = {
            ...this.config,
            ...config,
            intensityScale: MathUtils.clamp(config.intensityScale ?? this.config.intensityScale, 0, 1.2),
            minConfidence: MathUtils.clamp(config.minConfidence ?? this.config.minConfidence, 0, 1),
            returnToNeutralMs: MathUtils.clamp(config.returnToNeutralMs ?? this.config.returnToNeutralMs, 80, 2000),
            smoothingMs: MathUtils.clamp(config.smoothingMs ?? this.config.smoothingMs, 40, 800),
        };
    }

    retarget(snapshot: SincroPoseMotionSnapshot, nowMs: number): SincroPoseRetargetFrame {
        const deltaMs = this.lastUpdateAtMs == null
            ? 1000 / 60
            : MathUtils.clamp(nowMs - this.lastUpdateAtMs, 1, 120);
        this.lastUpdateAtMs = nowMs;

        if (!this.snapshotIsUsable(snapshot)) {
            return this.smoothFrame(NEUTRAL_POSE_FRAME, deltaMs, this.config.returnToNeutralMs);
        }

        const frame: SincroPoseRetargetFrame = {
            active: true,
            confidence: snapshot.confidence,
            upperBody: {
                spine: {
                    x: 0,
                    y: -snapshot.upperBody.torsoLean * this.config.torsoLeanRad * 0.45 * this.config.intensityScale,
                    z: -snapshot.upperBody.shoulderRoll * this.config.shoulderRollRad * 0.35 * this.config.intensityScale,
                },
                chest: {
                    x: 0,
                    y: -snapshot.upperBody.torsoLean * this.config.torsoLeanRad * this.config.intensityScale,
                    z: -snapshot.upperBody.shoulderRoll * this.config.shoulderRollRad * this.config.intensityScale,
                },
                leftShoulder: {
                    x: 0,
                    y: 0,
                    z: -snapshot.upperBody.shoulderRoll * this.config.shoulderLiftRad * this.config.intensityScale,
                },
                rightShoulder: {
                    x: 0,
                    y: 0,
                    z: -snapshot.upperBody.shoulderRoll * this.config.shoulderLiftRad * this.config.intensityScale,
                },
            },
            leftArm: this.retargetArm(snapshot.leftArm, "left"),
            rightArm: this.retargetArm(snapshot.rightArm, "right"),
        };
        return this.smoothFrame(frame, deltaMs, this.config.smoothingMs);
    }

    reset(): void {
        this.lastUpdateAtMs = null;
        this.smoothedFrame = cloneFrame(NEUTRAL_POSE_FRAME);
    }

    private snapshotIsUsable(snapshot: SincroPoseMotionSnapshot): boolean {
        return snapshot.trackingEnabled
            && snapshot.detected
            && !snapshot.degradedToFaceOnly
            && snapshot.confidence >= this.config.minConfidence;
    }

    private retargetArm(arm: SincroPoseArmMotionSnapshot, side: "left" | "right"): SincroPoseRetargetedArm {
        if (!arm.tracked || arm.confidence < this.config.minConfidence) {
            return cloneArm(NEUTRAL_POSE_FRAME.leftArm);
        }
        const sideSign = side === "left" ? -1 : 1;
        const scale = this.config.intensityScale;
        return {
            active: true,
            upperArm: {
                x: -positiveOnly(arm.upperArmLift) * this.config.upperArmLiftRad * scale,
                y: sideSign * arm.upperArmOpen * this.config.upperArmOpenRad * scale,
                z: -sideSign * positiveOnly(arm.upperArmLift) * this.config.upperArmOpenRad * 0.55 * scale,
            },
            lowerArm: {
                x: 0,
                y: sideSign * arm.lowerArmFlex * this.config.lowerArmFlexRad * scale,
                z: 0,
            },
            wrist: {
                x: 0,
                y: 0,
                z: sideSign * arm.wristRaise * this.config.wristRaiseRad * scale,
            },
        };
    }

    private smoothFrame(
        target: SincroPoseRetargetFrame,
        deltaMs: number,
        smoothingMs: number,
    ): SincroPoseRetargetFrame {
        const alpha = 1 - Math.exp(-deltaMs / Math.max(1, smoothingMs));
        this.smoothedFrame = smoothFrame(this.smoothedFrame, target, alpha);
        return cloneFrame(this.smoothedFrame);
    }
}

function positiveOnly(value: number): number {
    return Math.max(0, value);
}

function smoothFrame(current: SincroPoseRetargetFrame, target: SincroPoseRetargetFrame, alpha: number): SincroPoseRetargetFrame {
    return {
        active: target.active,
        confidence: MathUtils.lerp(current.confidence, target.confidence, alpha),
        upperBody: {
            spine: smoothVector(current.upperBody.spine, target.upperBody.spine, alpha),
            chest: smoothVector(current.upperBody.chest, target.upperBody.chest, alpha),
            leftShoulder: smoothVector(current.upperBody.leftShoulder, target.upperBody.leftShoulder, alpha),
            rightShoulder: smoothVector(current.upperBody.rightShoulder, target.upperBody.rightShoulder, alpha),
        },
        leftArm: smoothArm(current.leftArm, target.leftArm, alpha),
        rightArm: smoothArm(current.rightArm, target.rightArm, alpha),
    };
}

function smoothArm(current: SincroPoseRetargetedArm, target: SincroPoseRetargetedArm, alpha: number): SincroPoseRetargetedArm {
    return {
        active: target.active,
        upperArm: smoothVector(current.upperArm, target.upperArm, alpha),
        lowerArm: smoothVector(current.lowerArm, target.lowerArm, alpha),
        wrist: smoothVector(current.wrist, target.wrist, alpha),
    };
}

function smoothVector(
    current: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    alpha: number,
): { x: number; y: number; z: number } {
    return {
        x: MathUtils.lerp(current.x, target.x, alpha),
        y: MathUtils.lerp(current.y, target.y, alpha),
        z: MathUtils.lerp(current.z, target.z, alpha),
    };
}

function cloneFrame(frame: SincroPoseRetargetFrame): SincroPoseRetargetFrame {
    return {
        active: frame.active,
        confidence: frame.confidence,
        upperBody: {
            spine: { ...frame.upperBody.spine },
            chest: { ...frame.upperBody.chest },
            leftShoulder: { ...frame.upperBody.leftShoulder },
            rightShoulder: { ...frame.upperBody.rightShoulder },
        },
        leftArm: cloneArm(frame.leftArm),
        rightArm: cloneArm(frame.rightArm),
    };
}

function cloneArm(arm: SincroPoseRetargetedArm): SincroPoseRetargetedArm {
    return {
        active: arm.active,
        upperArm: { ...arm.upperArm },
        lowerArm: { ...arm.lowerArm },
        wrist: { ...arm.wrist },
    };
}
