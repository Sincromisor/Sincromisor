import type { VRM } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroPoseMotionSnapshot } from "../../FaceTracking/SincroPoseMotionSnapshot";
import { SincroArmIkSolver } from "./SincroArmIkSolver";
import { runSincroCcdIkProbe, type SincroCcdIkProbeResult } from "./sincroCcdIkProbe";
import { retargetPoseArm } from "./sincroPoseArmRetargeter";
import {
    cloneFrame,
    ikModeForArms,
    smoothFrame,
    withFallbackReason,
    withSolverProbe,
} from "./sincroPoseRetargetFrame";
import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    NEUTRAL_POSE_FRAME,
    type SincroPoseRetargetConfig,
    type SincroPoseRetargetFrame,
} from "./sincroPoseRetargetTypes";

export type {
    SincroPoseArmIkMode,
    SincroPoseIkMode,
    SincroPoseRetargetConfig,
    SincroPoseRetargetedArm,
    SincroPoseRetargetFrame,
} from "./sincroPoseRetargetTypes";
export { DEFAULT_SINCRO_POSE_RETARGET_CONFIG } from "./sincroPoseRetargetTypes";

type UpperBodyAnchor = SincroPoseRetargetFrame["anchor"];

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
        const leftArm = retargetPoseArm({
            arm: snapshot.leftArm,
            side: "left",
            config: this.config,
            armIkSolvers: this.armIkSolvers,
        });
        const rightArm = retargetPoseArm({
            arm: snapshot.rightArm,
            side: "right",
            config: this.config,
            armIkSolvers: this.armIkSolvers,
        });
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

function measureArmIkSolvers(vrm: VRM): Record<"left" | "right", SincroArmIkSolver> | undefined {
    const left = SincroArmIkSolver.fromVrm(vrm, "left");
    const right = SincroArmIkSolver.fromVrm(vrm, "right");
    if (!left || !right) {
        return undefined;
    }
    return { left, right };
}
