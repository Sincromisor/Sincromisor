import type { VRM } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseArmTargetSnapshot,
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../FaceTracking/SincroPoseMotionSnapshot";
import {
    type SincroArmIkQuaternion,
    type SincroArmIkSolveResult,
    SincroArmIkSolver,
} from "./SincroArmIkSolver";
import type { SincroArmIkConstraintSnapshot } from "./sincroArmIkConstraint";
import { runSincroCcdIkProbe, type SincroCcdIkProbeResult } from "./sincroCcdIkProbe";

export type SincroPoseArmIkMode = "feature_only" | "screen_space_ik" | "world_3d_ik";

export type SincroPoseRetargetedArm = {
    active: boolean;
    ikActive: boolean;
    ikWeight: number;
    ikSolverMode: SincroPoseArmIkMode | "none";
    fallbackReason?: string;
    constraint: SincroArmIkConstraintSnapshot;
    upperArm: { x: number; y: number; z: number };
    lowerArm: { x: number; y: number; z: number };
    wrist: { x: number; y: number; z: number };
    upperArmQuaternion?: SincroArmIkQuaternion;
    lowerArmQuaternion?: SincroArmIkQuaternion;
};

export type SincroPoseIkMode = "fallback" | SincroPoseArmIkMode;

export type SincroPoseRetargetFrame = {
    active: boolean;
    confidence: number;
    ikMode: SincroPoseIkMode;
    fallbackReason?: string;
    solverProbe: {
        ccdik?: SincroCcdIkProbeResult;
    };
    anchor: {
        active: boolean;
        weight: number;
        reason: string;
        shoulderOffset: { x: number; y: number };
    };
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
    armIkMode: SincroPoseArmIkMode;
    shoulderAnchorOffsetRad: number;
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
    armIkStrength: 1.0,
    armIkTargetScale: 1.0,
    armIkMaxLiftRad: MathUtils.degToRad(34.0),
    armIkMaxOpenRad: MathUtils.degToRad(28.0),
    armIkMaxForearmFlexRad: MathUtils.degToRad(38.0),
    armIkMode: "world_3d_ik",
    shoulderAnchorOffsetRad: MathUtils.degToRad(2.4),
};

const MIN_STRONG_TARGET_CONFIDENCE = 0.45;

const NEUTRAL_ARM_IK_CONSTRAINT: SincroArmIkConstraintSnapshot = {
    reasons: [],
    jointLimited: false,
    poleStabilized: false,
    collisionAvoided: false,
    weightScale: 1,
    targetPushDistance: 0,
};

const NEUTRAL_POSE_FRAME: SincroPoseRetargetFrame = {
    active: false,
    confidence: 0,
    ikMode: "fallback",
    fallbackReason: "neutral",
    solverProbe: {},
    anchor: {
        active: false,
        weight: 0,
        reason: "neutral",
        shoulderOffset: { x: 0, y: 0 },
    },
    upperBody: {
        spine: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
    },
    leftArm: {
        active: false,
        ikActive: false,
        ikWeight: 0,
        ikSolverMode: "none",
        fallbackReason: "neutral",
        constraint: { ...NEUTRAL_ARM_IK_CONSTRAINT },
        upperArm: { x: 0, y: 0, z: 0 },
        lowerArm: { x: 0, y: 0, z: 0 },
        wrist: { x: 0, y: 0, z: 0 },
        upperArmQuaternion: undefined,
        lowerArmQuaternion: undefined,
    },
    rightArm: {
        active: false,
        ikActive: false,
        ikWeight: 0,
        ikSolverMode: "none",
        fallbackReason: "neutral",
        constraint: { ...NEUTRAL_ARM_IK_CONSTRAINT },
        upperArm: { x: 0, y: 0, z: 0 },
        lowerArm: { x: 0, y: 0, z: 0 },
        wrist: { x: 0, y: 0, z: 0 },
        upperArmQuaternion: undefined,
        lowerArmQuaternion: undefined,
    },
};

type ArmIkTarget = {
    lift: number;
    open: number;
    flex: number;
    pole: number;
    weight: number;
};

type UpperBodyAnchor = SincroPoseRetargetFrame["anchor"];

type ArmIkSolveResult = {
    target?: ArmIkTarget;
    fallbackReason?: string;
};

type WorldArmIkSolveResult = {
    result?: SincroArmIkSolveResult;
    fallbackReason?: string;
};

// Pose同期はまだoptionalなので、低振幅・強いsmoothingでVRM向け値へ変換する。
// 腕が画面外へ出た時は部位単位で neutral に戻し、face-only の同期を邪魔しない。
export class SincroPoseRetargeter {
    private config: SincroPoseRetargetConfig;
    private lastUpdateAtMs?: number;
    private smoothedFrame: SincroPoseRetargetFrame = cloneFrame(NEUTRAL_POSE_FRAME);
    private armIkSolvers?: Record<"left" | "right", SincroArmIkSolver>;
    private ccdIkProbeResult?: SincroCcdIkProbeResult;

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
            intensityScale: MathUtils.clamp(
                config.intensityScale ?? this.config.intensityScale,
                0,
                1.2,
            ),
            minConfidence: MathUtils.clamp(config.minConfidence ?? this.config.minConfidence, 0, 1),
            returnToNeutralMs: MathUtils.clamp(
                config.returnToNeutralMs ?? this.config.returnToNeutralMs,
                80,
                2000,
            ),
            smoothingMs: MathUtils.clamp(config.smoothingMs ?? this.config.smoothingMs, 40, 800),
            armIkStrength: MathUtils.clamp(config.armIkStrength ?? this.config.armIkStrength, 0, 1),
            armIkTargetScale: MathUtils.clamp(
                config.armIkTargetScale ?? this.config.armIkTargetScale,
                0.2,
                1.5,
            ),
            armIkMode: config.armIkMode ?? this.config.armIkMode,
        };
    }

    attachVrm(vrm: VRM): void {
        this.armIkSolvers = measureArmIkSolvers(vrm);
        this.ccdIkProbeResult = runSincroCcdIkProbe(vrm, "left");
        this.reset();
    }

    retarget(snapshot: SincroPoseMotionSnapshot, nowMs: number): SincroPoseRetargetFrame {
        const deltaMs =
            this.lastUpdateAtMs === undefined
                ? 1000 / 60
                : MathUtils.clamp(nowMs - this.lastUpdateAtMs, 1, 120);
        this.lastUpdateAtMs = nowMs;

        const snapshotFallbackReason = this.snapshotFallbackReason(snapshot);
        if (snapshotFallbackReason) {
            return this.smoothFrame(
                withSolverProbe(
                    withFallbackReason(NEUTRAL_POSE_FRAME, snapshotFallbackReason),
                    this.solverProbeSnapshot(),
                ),
                deltaMs,
                this.config.returnToNeutralMs,
            );
        }

        const anchor = this.upperBodyAnchor(snapshot);
        const upperBodyWeight = anchor.weight * this.config.intensityScale;
        const leftArm = this.retargetArm(snapshot.leftArm, "left");
        const rightArm = this.retargetArm(snapshot.rightArm, "right");
        const frame: SincroPoseRetargetFrame = {
            active: true,
            confidence: snapshot.confidence,
            ikMode: ikModeForArms(leftArm, rightArm),
            fallbackReason: undefined,
            solverProbe: this.solverProbeSnapshot(),
            anchor,
            upperBody: {
                spine: {
                    x: 0,
                    y:
                        -snapshot.upperBody.torsoLean *
                        this.config.torsoLeanRad *
                        0.45 *
                        upperBodyWeight,
                    z:
                        -snapshot.upperBody.shoulderRoll *
                        this.config.shoulderRollRad *
                        0.35 *
                        upperBodyWeight,
                },
                chest: {
                    x: 0,
                    y:
                        (-snapshot.upperBody.torsoLean * this.config.torsoLeanRad -
                            anchor.shoulderOffset.x * this.config.shoulderAnchorOffsetRad) *
                        upperBodyWeight,
                    z:
                        (-snapshot.upperBody.shoulderRoll * this.config.shoulderRollRad -
                            anchor.shoulderOffset.y * this.config.shoulderAnchorOffsetRad) *
                        upperBodyWeight,
                },
                leftShoulder: {
                    x: 0,
                    y: 0,
                    z:
                        -snapshot.upperBody.shoulderRoll *
                        this.config.shoulderLiftRad *
                        upperBodyWeight,
                },
                rightShoulder: {
                    x: 0,
                    y: 0,
                    z:
                        -snapshot.upperBody.shoulderRoll *
                        this.config.shoulderLiftRad *
                        upperBodyWeight,
                },
            },
            leftArm,
            rightArm,
        };
        return this.smoothFrame(frame, deltaMs, this.config.smoothingMs);
    }

    reset(): void {
        this.lastUpdateAtMs = undefined;
        this.smoothedFrame = cloneFrame(NEUTRAL_POSE_FRAME);
    }

    private snapshotFallbackReason(snapshot: SincroPoseMotionSnapshot): string | undefined {
        if (!snapshot.trackingEnabled) {
            return snapshot.fallbackReason ?? "tracking_disabled";
        }
        if (snapshot.degradedToFaceOnly) {
            return snapshot.fallbackReason ?? "face_only";
        }
        if (!snapshot.detected) {
            return snapshot.fallbackReason ?? "pose_lost";
        }
        if (snapshot.confidence < this.config.minConfidence) {
            return "pose_low_confidence";
        }
        return undefined;
    }

    private upperBodyAnchor(snapshot: SincroPoseMotionSnapshot): UpperBodyAnchor {
        const leftShoulder = snapshot.leftArm.targets.shoulder;
        const rightShoulder = snapshot.rightArm.targets.shoulder;
        const shoulderTargetConfidence = Math.min(
            leftShoulder.confidence,
            rightShoulder.confidence,
        );
        // Shoulder anchors are deliberately weaker when hips are missing. This keeps close-up
        // camera framing usable without letting torso compensation fight the arm IK target.
        const targetConfidenceWeight = MathUtils.clamp(
            (shoulderTargetConfidence - this.config.minConfidence) /
                Math.max(1 - this.config.minConfidence, 0.01),
            0,
            1,
        );
        const widthWeight = MathUtils.clamp((snapshot.upperBody.shoulderWidth - 0.08) / 0.18, 0, 1);
        const hipWeight = snapshot.upperBody.hipCenterTracked ? 1 : 0.64;
        const weight = MathUtils.clamp(
            Math.min(targetConfidenceWeight, widthWeight) * hipWeight,
            0,
            1,
        );
        const shoulderOffset = {
            x: MathUtils.clamp(snapshot.upperBody.shoulderCenterX - 0.5, -0.45, 0.45),
            y: MathUtils.clamp(snapshot.upperBody.shoulderCenterY - 0.38, -0.35, 0.35),
        };
        let reason = "shoulder_width_anchor";
        if (weight <= 0.18) {
            reason = "anchor_low_confidence";
        } else if (!snapshot.upperBody.hipCenterTracked) {
            reason = "hips_fallback_to_shoulders";
        }
        return {
            active: weight > 0.18,
            weight,
            reason,
            shoulderOffset,
        };
    }

    private retargetArm(
        arm: SincroPoseArmMotionSnapshot,
        side: "left" | "right",
    ): SincroPoseRetargetedArm {
        if (!arm.tracked || arm.confidence < this.config.minConfidence) {
            return withArmFallbackReason(
                cloneArm(NEUTRAL_POSE_FRAME.leftArm),
                arm.tracked ? "arm_low_confidence" : "arm_not_tracked",
            );
        }
        const sideSign = side === "left" ? -1 : 1;
        const scale = this.config.intensityScale;
        const featureArm: SincroPoseRetargetedArm = {
            active: true,
            ikActive: false,
            ikWeight: 0,
            ikSolverMode: "feature_only",
            fallbackReason: undefined,
            constraint: cloneArmIkConstraint(NEUTRAL_ARM_IK_CONSTRAINT),
            upperArm: {
                x: -positiveOnly(arm.upperArmLift) * this.config.upperArmLiftRad * scale,
                y: sideSign * arm.upperArmOpen * this.config.upperArmOpenRad * scale,
                z:
                    -sideSign *
                    positiveOnly(arm.upperArmLift) *
                    this.config.upperArmOpenRad *
                    0.55 *
                    scale,
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
            upperArmQuaternion: undefined,
            lowerArmQuaternion: undefined,
        };

        if (this.config.armIkMode === "feature_only" || this.config.armIkStrength <= 0) {
            return {
                ...featureArm,
                fallbackReason:
                    this.config.armIkMode === "feature_only" ? undefined : "ik_strength_zero",
            };
        }

        if (this.config.armIkMode === "world_3d_ik") {
            return this.retargetWorldArmIk(arm.targets, side, featureArm);
        }

        const ikResult = this.solveScreenSpaceArmIk(arm.targets, side);
        if (!ikResult.target) {
            return {
                ...featureArm,
                fallbackReason: ikResult.fallbackReason,
            };
        }
        const ikScale = scale;
        const ikArm: SincroPoseRetargetedArm = {
            active: true,
            ikActive: true,
            ikWeight: ikResult.target.weight,
            ikSolverMode: "screen_space_ik",
            fallbackReason: undefined,
            constraint: cloneArmIkConstraint(NEUTRAL_ARM_IK_CONSTRAINT),
            upperArm: {
                x: -ikResult.target.lift * this.config.armIkMaxLiftRad * ikScale,
                y: sideSign * ikResult.target.open * this.config.armIkMaxOpenRad * ikScale,
                z: -sideSign * ikResult.target.pole * this.config.armIkMaxOpenRad * 0.42 * ikScale,
            },
            lowerArm: {
                x: 0,
                y: sideSign * ikResult.target.flex * this.config.armIkMaxForearmFlexRad * ikScale,
                z: 0,
            },
            wrist: {
                x: 0,
                y: 0,
                z: featureArm.wrist.z,
            },
            upperArmQuaternion: undefined,
            lowerArmQuaternion: undefined,
        };
        return {
            ...blendArm(featureArm, ikArm, this.config.armIkStrength * ikResult.target.weight),
            ikActive: true,
            ikWeight: ikResult.target.weight,
            ikSolverMode: "screen_space_ik",
            fallbackReason: undefined,
        };
    }

    private retargetWorldArmIk(
        targets: SincroPoseArmTargetSnapshot,
        side: "left" | "right",
        featureArm: SincroPoseRetargetedArm,
    ): SincroPoseRetargetedArm {
        const ikResult = this.solveWorldArmIk(targets, side);
        if (!ikResult.result) {
            return {
                ...featureArm,
                fallbackReason: ikResult.fallbackReason,
            };
        }
        const ikBlendWeight = this.config.armIkStrength * ikResult.result.weight;
        return {
            active: true,
            ikActive: true,
            ikWeight: ikResult.result.weight,
            ikSolverMode: "world_3d_ik",
            fallbackReason:
                ikResult.result.constraint.reasons[0] ??
                (ikResult.result.targetClamped ? "ik_target_clamped" : undefined),
            constraint: cloneArmIkConstraint(ikResult.result.constraint),
            upperArm: { x: 0, y: 0, z: 0 },
            lowerArm: { x: 0, y: 0, z: 0 },
            wrist: { ...featureArm.wrist },
            upperArmQuaternion: blendQuaternion(
                ikResult.result.neutralUpperArmQuaternion,
                ikResult.result.upperArmQuaternion,
                ikBlendWeight,
            ),
            lowerArmQuaternion: blendQuaternion(
                ikResult.result.neutralLowerArmQuaternion,
                ikResult.result.lowerArmQuaternion,
                ikBlendWeight,
            ),
        };
    }

    private solveWorldArmIk(
        targets: SincroPoseArmTargetSnapshot,
        side: "left" | "right",
    ): WorldArmIkSolveResult {
        const solver = this.armIkSolvers?.[side];
        if (!solver) {
            return { fallbackReason: "ik_solver_missing" };
        }
        const gateReason = armWorldIkGateReason(targets);
        if (gateReason) {
            return { fallbackReason: gateReason };
        }
        const wrist = mapWorldTargetDeltaToVrm(
            targets.shoulder,
            targets.wrist,
            solver.shoulderWidth * this.config.armIkTargetScale,
        );
        const elbowPole = mapWorldTargetDeltaToVrm(
            targets.shoulder,
            targets.elbow,
            solver.shoulderWidth * this.config.armIkTargetScale,
        );
        const weight = MathUtils.clamp(
            Math.min(
                targets.shoulder.world.worldIkWeight,
                targets.elbow.world.worldIkWeight,
                targets.wrist.world.worldIkWeight,
            ),
            0,
            1,
        );
        return {
            result: solver.solve({ wrist, elbowPole, weight }) ?? undefined,
            fallbackReason: undefined,
        };
    }

    private solveScreenSpaceArmIk(
        targets: SincroPoseArmTargetSnapshot,
        side: "left" | "right",
    ): ArmIkSolveResult {
        const solver = this.armIkSolvers?.[side];
        if (!solver) {
            return {
                fallbackReason: "ik_solver_missing",
            };
        }
        const gateReason = armIkGateReason(targets);
        if (gateReason) {
            return { fallbackReason: gateReason };
        }
        const targetWeight = MathUtils.clamp(
            Math.min(targets.shoulder.ikWeight, targets.elbow.ikWeight, targets.wrist.ikWeight),
            0,
            1,
        );

        const sideSign = side === "left" ? -1 : 1;
        const modelScale = solver.shoulderWidth * this.config.armIkTargetScale;
        const wristX = (targets.wrist.localX - targets.shoulder.localX) * modelScale;
        const wristY = (targets.wrist.localY - targets.shoulder.localY) * modelScale;
        const elbowX = (targets.elbow.localX - targets.shoulder.localX) * modelScale;
        const elbowY = (targets.elbow.localY - targets.shoulder.localY) * modelScale;
        const maxReach = Math.max(solver.upperArmLength + solver.lowerArmLength, 0.01);
        const minReach = Math.max(
            Math.abs(solver.upperArmLength - solver.lowerArmLength),
            maxReach * 0.18,
        );
        const reach = MathUtils.clamp(Math.hypot(wristX, wristY), minReach, maxReach * 0.98);
        const normalizedReach = Math.max(reach, 1e-4);

        // Tracker target は肩幅基準の screen-space 2D 値なので、奥行きは解かずに
        // 手首方向を主軸、肘方向を pole の近似として使う。外れ値は角度へ変換する前に強く丸める。
        const openFromWrist = MathUtils.clamp((wristX * sideSign) / normalizedReach, -1, 1);
        const liftFromWrist = MathUtils.clamp(wristY / normalizedReach, -1, 1);
        const openFromElbow = MathUtils.clamp(
            (elbowX * sideSign) / Math.max(Math.hypot(elbowX, elbowY), 1e-4),
            -1,
            1,
        );
        const liftFromElbow = MathUtils.clamp(
            elbowY / Math.max(Math.hypot(elbowX, elbowY), 1e-4),
            -1,
            1,
        );
        const elbowCos = MathUtils.clamp(
            (solver.upperArmLength ** 2 + solver.lowerArmLength ** 2 - reach ** 2) /
                (2 * solver.upperArmLength * solver.lowerArmLength),
            -1,
            1,
        );
        const elbowAngle = Math.acos(elbowCos);
        const flexByReach = MathUtils.clamp(1 - elbowAngle / Math.PI, 0, 1);
        const flexByPole = positiveOnly(liftFromElbow - liftFromWrist * 0.35) * 0.35;

        return {
            target: {
                lift: MathUtils.clamp(liftFromWrist * 0.72 + liftFromElbow * 0.28, -0.85, 0.95),
                open: MathUtils.clamp(openFromWrist * 0.7 + openFromElbow * 0.3, -0.75, 0.95),
                flex: MathUtils.clamp(flexByReach * 1.25 + flexByPole, 0, 1),
                pole: MathUtils.clamp(openFromElbow - openFromWrist * 0.35, -1, 1),
                weight: targetWeight,
            },
            fallbackReason: undefined,
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

    private solverProbeSnapshot(): SincroPoseRetargetFrame["solverProbe"] {
        return {
            ccdik: this.ccdIkProbeResult
                ? {
                      ...this.ccdIkProbeResult,
                      notes: [...this.ccdIkProbeResult.notes],
                  }
                : undefined,
        };
    }
}

function positiveOnly(value: number): number {
    return Math.max(0, value);
}

function smoothFrame(
    current: SincroPoseRetargetFrame,
    target: SincroPoseRetargetFrame,
    alpha: number,
): SincroPoseRetargetFrame {
    return {
        active: target.active,
        confidence: MathUtils.lerp(current.confidence, target.confidence, alpha),
        ikMode: target.ikMode,
        fallbackReason: target.fallbackReason,
        solverProbe: cloneSolverProbe(target.solverProbe),
        anchor: {
            active: target.anchor.active,
            weight: MathUtils.lerp(current.anchor.weight, target.anchor.weight, alpha),
            reason: target.anchor.reason,
            shoulderOffset: smoothVector2(
                current.anchor.shoulderOffset,
                target.anchor.shoulderOffset,
                alpha,
            ),
        },
        upperBody: {
            spine: smoothVector(current.upperBody.spine, target.upperBody.spine, alpha),
            chest: smoothVector(current.upperBody.chest, target.upperBody.chest, alpha),
            leftShoulder: smoothVector(
                current.upperBody.leftShoulder,
                target.upperBody.leftShoulder,
                alpha,
            ),
            rightShoulder: smoothVector(
                current.upperBody.rightShoulder,
                target.upperBody.rightShoulder,
                alpha,
            ),
        },
        leftArm: smoothArm(current.leftArm, target.leftArm, alpha),
        rightArm: smoothArm(current.rightArm, target.rightArm, alpha),
    };
}

function smoothArm(
    current: SincroPoseRetargetedArm,
    target: SincroPoseRetargetedArm,
    alpha: number,
): SincroPoseRetargetedArm {
    return {
        active: target.active,
        ikActive: target.ikActive,
        ikWeight: MathUtils.lerp(current.ikWeight, target.ikWeight, alpha),
        ikSolverMode: target.ikSolverMode,
        fallbackReason: target.fallbackReason,
        constraint: cloneArmIkConstraint(target.constraint),
        upperArm: smoothVector(current.upperArm, target.upperArm, alpha),
        lowerArm: smoothVector(current.lowerArm, target.lowerArm, alpha),
        wrist: smoothVector(current.wrist, target.wrist, alpha),
        upperArmQuaternion: smoothQuaternion(
            current.upperArmQuaternion,
            target.upperArmQuaternion,
            alpha,
        ),
        lowerArmQuaternion: smoothQuaternion(
            current.lowerArmQuaternion,
            target.lowerArmQuaternion,
            alpha,
        ),
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
        ikActive: ikArm.ikActive,
        ikWeight: ikArm.ikWeight,
        ikSolverMode: ikArm.ikSolverMode,
        fallbackReason: ikArm.fallbackReason ?? featureArm.fallbackReason,
        constraint: cloneArmIkConstraint(ikArm.constraint),
        upperArm: smoothVector(featureArm.upperArm, ikArm.upperArm, alpha),
        lowerArm: smoothVector(featureArm.lowerArm, ikArm.lowerArm, alpha),
        wrist: smoothVector(featureArm.wrist, ikArm.wrist, alpha),
        upperArmQuaternion: ikArm.upperArmQuaternion,
        lowerArmQuaternion: ikArm.lowerArmQuaternion,
    };
}

function smoothQuaternion(
    current: SincroArmIkQuaternion | undefined,
    target: SincroArmIkQuaternion | undefined,
    alpha: number,
): SincroArmIkQuaternion | undefined {
    if (!target) {
        return undefined;
    }
    if (!current) {
        return { ...target };
    }
    return serializeQuaternion(
        deserializeQuaternion(current).slerp(deserializeQuaternion(target), alpha).normalize(),
    );
}

function blendQuaternion(
    from: SincroArmIkQuaternion,
    to: SincroArmIkQuaternion,
    alpha: number,
): SincroArmIkQuaternion {
    return serializeQuaternion(
        deserializeQuaternion(from)
            .slerp(deserializeQuaternion(to), MathUtils.clamp(alpha, 0, 1))
            .normalize(),
    );
}

function deserializeQuaternion(value: SincroArmIkQuaternion): Quaternion {
    return new Quaternion(value.x, value.y, value.z, value.w);
}

function serializeQuaternion(quaternion: Quaternion): SincroArmIkQuaternion {
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
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

function smoothVector2(
    current: { x: number; y: number },
    target: { x: number; y: number },
    alpha: number,
): { x: number; y: number } {
    return {
        x: MathUtils.lerp(current.x, target.x, alpha),
        y: MathUtils.lerp(current.y, target.y, alpha),
    };
}

function cloneFrame(frame: SincroPoseRetargetFrame): SincroPoseRetargetFrame {
    return {
        active: frame.active,
        confidence: frame.confidence,
        ikMode: frame.ikMode,
        fallbackReason: frame.fallbackReason,
        solverProbe: cloneSolverProbe(frame.solverProbe),
        anchor: {
            active: frame.anchor.active,
            weight: frame.anchor.weight,
            reason: frame.anchor.reason,
            shoulderOffset: { ...frame.anchor.shoulderOffset },
        },
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
        ikActive: arm.ikActive,
        ikWeight: arm.ikWeight,
        ikSolverMode: arm.ikSolverMode,
        fallbackReason: arm.fallbackReason,
        constraint: cloneArmIkConstraint(arm.constraint),
        upperArm: { ...arm.upperArm },
        lowerArm: { ...arm.lowerArm },
        wrist: { ...arm.wrist },
        upperArmQuaternion: arm.upperArmQuaternion ? { ...arm.upperArmQuaternion } : undefined,
        lowerArmQuaternion: arm.lowerArmQuaternion ? { ...arm.lowerArmQuaternion } : undefined,
    };
}

function withFallbackReason(
    frame: SincroPoseRetargetFrame,
    fallbackReason: string,
): SincroPoseRetargetFrame {
    return {
        ...cloneFrame(frame),
        active: false,
        ikMode: "fallback",
        fallbackReason,
        anchor: {
            ...frame.anchor,
            active: false,
            reason: fallbackReason,
        },
        solverProbe: cloneSolverProbe(frame.solverProbe),
    };
}

function cloneSolverProbe(
    solverProbe: SincroPoseRetargetFrame["solverProbe"],
): SincroPoseRetargetFrame["solverProbe"] {
    return {
        ccdik: solverProbe.ccdik
            ? {
                  ...solverProbe.ccdik,
                  notes: [...solverProbe.ccdik.notes],
              }
            : undefined,
    };
}

function withSolverProbe(
    frame: SincroPoseRetargetFrame,
    solverProbe: SincroPoseRetargetFrame["solverProbe"],
): SincroPoseRetargetFrame {
    return {
        ...cloneFrame(frame),
        solverProbe: cloneSolverProbe(solverProbe),
    };
}

function withArmFallbackReason(
    arm: SincroPoseRetargetedArm,
    fallbackReason: string,
): SincroPoseRetargetedArm {
    return {
        ...arm,
        active: false,
        ikActive: false,
        ikWeight: 0,
        ikSolverMode: "none",
        fallbackReason,
        constraint: cloneArmIkConstraint(NEUTRAL_ARM_IK_CONSTRAINT),
    };
}

function cloneArmIkConstraint(
    constraint: SincroArmIkConstraintSnapshot,
): SincroArmIkConstraintSnapshot {
    return {
        ...constraint,
        reasons: [...constraint.reasons],
    };
}

function armWorldIkGateReason(targets: SincroPoseArmTargetSnapshot): string | undefined {
    if (!targets.shoulder.world.worldUsableForIk) {
        return armWorldIkTargetReason("shoulder", targets.shoulder);
    }
    if (!targets.elbow.world.worldUsableForIk) {
        return armWorldIkTargetReason("elbow", targets.elbow);
    }
    if (!targets.wrist.world.worldUsableForIk) {
        return armWorldIkTargetReason("wrist", targets.wrist);
    }
    return undefined;
}

function armWorldIkTargetReason(
    joint: "shoulder" | "elbow" | "wrist",
    target: SincroPoseTargetPointSnapshot,
): string {
    if (!target.world.hasWorldCoordinates) {
        return `world_ik_${joint}_${target.world.worldStaleReason ?? "missing"}`;
    }
    if (target.world.worldConfidence < MIN_STRONG_TARGET_CONFIDENCE) {
        return `world_ik_${joint}_low_confidence`;
    }
    return `world_ik_${joint}_missing`;
}

function mapWorldTargetDeltaToVrm(
    shoulder: SincroPoseTargetPointSnapshot,
    target: SincroPoseTargetPointSnapshot,
    scale: number,
): Vector3 {
    const deltaX = (target.world.normalizedX ?? 0) - (shoulder.world.normalizedX ?? 0);
    const deltaY = (target.world.normalizedY ?? 0) - (shoulder.world.normalizedY ?? 0);
    const deltaZ = (target.world.normalizedZ ?? 0) - (shoulder.world.normalizedZ ?? 0);
    // MediaPipe world target は入力 video と同じ左右で返るため、X は VRM 表示側でも維持する。
    // Three.js/VRM は Y-up なので上下を反転し、Z は表示側の奥行きへ合わせて反転する。
    // Zは推定揺れが大きいため、横/縦より弱く使って肘の裏返りを抑える。
    return new Vector3(deltaX * scale, -deltaY * scale, -deltaZ * scale * 0.72);
}

function armIkGateReason(targets: SincroPoseArmTargetSnapshot): string | undefined {
    if (!targets.shoulder.tracked) {
        return armIkTargetReason("shoulder", targets.shoulder);
    }
    if (!targets.elbow.usableForIk) {
        return armIkTargetReason("elbow", targets.elbow);
    }
    if (!targets.wrist.usableForIk) {
        return armIkTargetReason("wrist", targets.wrist);
    }
    return undefined;
}

function armIkTargetReason(
    joint: "shoulder" | "elbow" | "wrist",
    target: SincroPoseTargetPointSnapshot,
): string {
    if (!target.hasFiniteCoordinates) {
        return `ik_${joint}_coordinates_missing`;
    }
    if (target.staleReason === "out_of_frame") {
        return `ik_${joint}_out_of_frame`;
    }
    if (target.confidence < MIN_STRONG_TARGET_CONFIDENCE) {
        return `ik_${joint}_low_confidence`;
    }
    return `ik_${joint}_missing`;
}

function ikModeForArms(
    leftArm: SincroPoseRetargetedArm,
    rightArm: SincroPoseRetargetedArm,
): SincroPoseIkMode {
    if (leftArm.ikSolverMode === "world_3d_ik" || rightArm.ikSolverMode === "world_3d_ik") {
        return "world_3d_ik";
    }
    if (leftArm.ikSolverMode === "screen_space_ik" || rightArm.ikSolverMode === "screen_space_ik") {
        return "screen_space_ik";
    }
    if (leftArm.active || rightArm.active) {
        return "feature_only";
    }
    return "fallback";
}

function measureArmIkSolvers(vrm: VRM): Record<"left" | "right", SincroArmIkSolver> | undefined {
    const left = SincroArmIkSolver.fromVrm(vrm, "left");
    const right = SincroArmIkSolver.fromVrm(vrm, "right");
    if (!left || !right) {
        return undefined;
    }
    return { left, right };
}
