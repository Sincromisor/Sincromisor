import type { VRM } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    type AvatarMotionProfile,
    cloneAvatarMotionProfile,
    createAvatarMotionProfile,
} from "../avatarProfile/avatarMotionProfile";
import { SincroArmIkSolver } from "../ik/sincroArmIkSolver";
import { runSincroCcdIkProbe, type SincroCcdIkProbeResult } from "../ik/sincroCcdIkProbe";
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
import {
    createSincroPoseUpperBodyAnchor,
    createSincroPoseUpperBodyFrame,
} from "./sincroPoseRetargetUpperBody";

export type {
    ComposerArmApplicationMode,
    ComposerSemanticFingerApplicationMode,
    ComposerTorsoShoulderApplicationMode,
    SincroPoseArmIkMode,
    SincroPoseIkMode,
    SincroPoseRetargetConfig,
    SincroPoseRetargetedArm,
    SincroPoseRetargetFrame,
} from "./sincroPoseRetargetTypes";
export { DEFAULT_SINCRO_POSE_RETARGET_CONFIG } from "./sincroPoseRetargetTypes";

// Pose同期はまだoptionalなので、低振幅・強いsmoothingでVRM向け値へ変換する。
// 腕が画面外へ出た時は部位単位で neutral に戻し、face-only の同期を邪魔しない。
export class SincroPoseRetargeter {
    private config: SincroPoseRetargetConfig;
    private lastUpdateAtMs?: number;
    private smoothedFrame: SincroPoseRetargetFrame = cloneFrame(NEUTRAL_POSE_FRAME);
    private armIkSolvers?: Record<"left" | "right", SincroArmIkSolver>;
    private ccdIkProbeResult?: SincroCcdIkProbeResult;
    private avatarMotionProfile?: AvatarMotionProfile;

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
        this.avatarMotionProfile = createAvatarMotionProfile(vrm);
        this.armIkSolvers = measureArmIkSolvers(vrm);
        this.ccdIkProbeResult = runSincroCcdIkProbe(vrm, "left");
        this.reset();
    }

    getAvatarMotionProfile(): AvatarMotionProfile | undefined {
        return this.avatarMotionProfile
            ? cloneAvatarMotionProfile(this.avatarMotionProfile)
            : undefined;
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

        const anchor = createSincroPoseUpperBodyAnchor(snapshot, this.config);
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
            upperBody: createSincroPoseUpperBodyFrame({
                snapshot,
                config: this.config,
                anchor,
                upperBodyWeight,
            }),
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
