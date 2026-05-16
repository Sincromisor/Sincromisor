import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseArmTargetSnapshot,
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
    armIkStrength: number;
    armIkTargetScale: number;
    armIkMaxLiftRad: number;
    armIkMaxOpenRad: number;
    armIkMaxForearmFlexRad: number;
};

export const DEFAULT_SINCRO_POSE_RETARGET_CONFIG: SincroPoseRetargetConfig = {
    intensityScale: 0.68,
    minConfidence: 0.45,
    returnToNeutralMs: 520,
    smoothingMs: 155,
    torsoLeanRad: MathUtils.degToRad(6.0),
    shoulderRollRad: MathUtils.degToRad(4.8),
    shoulderLiftRad: MathUtils.degToRad(4.0),
    upperArmLiftRad: MathUtils.degToRad(18.0),
    upperArmOpenRad: MathUtils.degToRad(12.0),
    lowerArmFlexRad: MathUtils.degToRad(14.0),
    wristRaiseRad: MathUtils.degToRad(7.0),
    armIkStrength: 0.58,
    armIkTargetScale: 0.72,
    armIkMaxLiftRad: MathUtils.degToRad(34.0),
    armIkMaxOpenRad: MathUtils.degToRad(28.0),
    armIkMaxForearmFlexRad: MathUtils.degToRad(38.0),
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

type ArmRigMetrics = {
    upperArmLength: number;
    lowerArmLength: number;
    shoulderWidth: number;
};

type ArmIkTarget = {
    lift: number;
    open: number;
    flex: number;
    pole: number;
};

// Pose同期はまだoptionalなので、低振幅・強いsmoothingでVRM向け値へ変換する。
// 腕が画面外へ出た時は部位単位で neutral に戻し、face-only の同期を邪魔しない。
export class SincroPoseRetargeter {
    private config: SincroPoseRetargetConfig;
    private lastUpdateAtMs: number | null = null;
    private smoothedFrame: SincroPoseRetargetFrame = cloneFrame(NEUTRAL_POSE_FRAME);
    private armRigMetrics: Record<"left" | "right", ArmRigMetrics> | null = null;

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
            armIkStrength: MathUtils.clamp(config.armIkStrength ?? this.config.armIkStrength, 0, 1),
            armIkTargetScale: MathUtils.clamp(config.armIkTargetScale ?? this.config.armIkTargetScale, 0.2, 1.5),
        };
    }

    attachVrm(vrm: VRM): void {
        this.armRigMetrics = measureArmRigMetrics(vrm);
        this.reset();
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
        const featureArm: SincroPoseRetargetedArm = {
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
        const ikTarget = this.solveArmIk(arm.targets, side);
        if (!ikTarget || this.config.armIkStrength <= 0) {
            return featureArm;
        }
        const ikScale = scale;
        const ikArm: SincroPoseRetargetedArm = {
            active: true,
            upperArm: {
                x: -ikTarget.lift * this.config.armIkMaxLiftRad * ikScale,
                y: sideSign * ikTarget.open * this.config.armIkMaxOpenRad * ikScale,
                z: -sideSign * ikTarget.pole * this.config.armIkMaxOpenRad * 0.42 * ikScale,
            },
            lowerArm: {
                x: 0,
                y: sideSign * ikTarget.flex * this.config.armIkMaxForearmFlexRad * ikScale,
                z: 0,
            },
            wrist: {
                x: 0,
                y: 0,
                z: featureArm.wrist.z,
            },
        };
        return blendArm(featureArm, ikArm, this.config.armIkStrength);
    }

    private solveArmIk(targets: SincroPoseArmTargetSnapshot, side: "left" | "right"): ArmIkTarget | null {
        const metrics = this.armRigMetrics?.[side];
        if (!metrics || !targets.shoulder.tracked || !targets.elbow.tracked || !targets.wrist.tracked) {
            return null;
        }
        const targetConfidence = Math.min(
            targets.shoulder.confidence,
            targets.elbow.confidence,
            targets.wrist.confidence,
        );
        if (targetConfidence < this.config.minConfidence) {
            return null;
        }

        const sideSign = side === "left" ? -1 : 1;
        const modelScale = metrics.shoulderWidth * this.config.armIkTargetScale;
        const wristX = (targets.wrist.localX - targets.shoulder.localX) * modelScale;
        const wristY = (targets.wrist.localY - targets.shoulder.localY) * modelScale;
        const elbowX = (targets.elbow.localX - targets.shoulder.localX) * modelScale;
        const elbowY = (targets.elbow.localY - targets.shoulder.localY) * modelScale;
        const maxReach = Math.max(metrics.upperArmLength + metrics.lowerArmLength, 0.01);
        const minReach = Math.max(Math.abs(metrics.upperArmLength - metrics.lowerArmLength), maxReach * 0.18);
        const reach = MathUtils.clamp(Math.hypot(wristX, wristY), minReach, maxReach * 0.98);
        const normalizedReach = Math.max(reach, 1e-4);

        // Tracker target は肩幅基準の screen-space 2D 値なので、奥行きは解かずに
        // 手首方向を主軸、肘方向を pole の近似として使う。外れ値は角度へ変換する前に強く丸める。
        const openFromWrist = MathUtils.clamp((wristX * sideSign) / normalizedReach, -1, 1);
        const liftFromWrist = MathUtils.clamp(wristY / normalizedReach, -1, 1);
        const openFromElbow = MathUtils.clamp((elbowX * sideSign) / Math.max(Math.hypot(elbowX, elbowY), 1e-4), -1, 1);
        const liftFromElbow = MathUtils.clamp(elbowY / Math.max(Math.hypot(elbowX, elbowY), 1e-4), -1, 1);
        const elbowCos = MathUtils.clamp(
            (
                metrics.upperArmLength ** 2
                + metrics.lowerArmLength ** 2
                - reach ** 2
            ) / (2 * metrics.upperArmLength * metrics.lowerArmLength),
            -1,
            1,
        );
        const elbowAngle = Math.acos(elbowCos);
        const flexByReach = MathUtils.clamp(1 - elbowAngle / Math.PI, 0, 1);
        const flexByPole = positiveOnly(liftFromElbow - liftFromWrist * 0.35) * 0.35;

        return {
            lift: MathUtils.clamp(liftFromWrist * 0.72 + liftFromElbow * 0.28, -0.85, 0.95),
            open: MathUtils.clamp(openFromWrist * 0.7 + openFromElbow * 0.3, -0.75, 0.95),
            flex: MathUtils.clamp(flexByReach * 1.25 + flexByPole, 0, 1),
            pole: MathUtils.clamp(openFromElbow - openFromWrist * 0.35, -1, 1),
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

function blendArm(
    featureArm: SincroPoseRetargetedArm,
    ikArm: SincroPoseRetargetedArm,
    ikStrength: number,
): SincroPoseRetargetedArm {
    const alpha = MathUtils.clamp(ikStrength, 0, 1);
    return {
        active: featureArm.active || ikArm.active,
        upperArm: smoothVector(featureArm.upperArm, ikArm.upperArm, alpha),
        lowerArm: smoothVector(featureArm.lowerArm, ikArm.lowerArm, alpha),
        wrist: smoothVector(featureArm.wrist, ikArm.wrist, alpha),
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

function measureArmRigMetrics(vrm: VRM): Record<"left" | "right", ArmRigMetrics> | null {
    vrm.scene.updateMatrixWorld(true);
    const leftShoulder = getBoneWorldPosition(vrm, "leftUpperArm");
    const rightShoulder = getBoneWorldPosition(vrm, "rightUpperArm");
    const shoulderWidth = leftShoulder && rightShoulder
        ? Math.max(leftShoulder.distanceTo(rightShoulder), 0.08)
        : 0.32;
    const left = measureArmSide(vrm, "left", shoulderWidth);
    const right = measureArmSide(vrm, "right", shoulderWidth);
    if (!left || !right) {
        return null;
    }
    return { left, right };
}

function measureArmSide(vrm: VRM, side: "left" | "right", shoulderWidth: number): ArmRigMetrics | null {
    const upperArm = getBoneWorldPosition(vrm, `${side}UpperArm` as VRMHumanBoneName);
    const lowerArm = getBoneWorldPosition(vrm, `${side}LowerArm` as VRMHumanBoneName);
    const hand = getBoneWorldPosition(vrm, `${side}Hand` as VRMHumanBoneName);
    if (!upperArm || !lowerArm || !hand) {
        return null;
    }
    return {
        upperArmLength: Math.max(upperArm.distanceTo(lowerArm), 0.04),
        lowerArmLength: Math.max(lowerArm.distanceTo(hand), 0.04),
        shoulderWidth,
    };
}

function getBoneWorldPosition(vrm: VRM, name: VRMHumanBoneName): Vector3 | null {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    return node ? node.getWorldPosition(new Vector3()) : null;
}
