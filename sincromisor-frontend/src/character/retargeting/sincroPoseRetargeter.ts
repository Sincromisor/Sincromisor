import type { VRM } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    type AvatarMotionProfile,
    cloneAvatarMotionProfile,
    createAvatarMotionProfile,
} from "../avatarProfile/avatarMotionProfile";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { SincroArmIkSolveResult } from "../ik/sincroArmIkSolver";
import { SincroArmIkSolver } from "../ik/sincroArmIkSolver";
import type { SincroArmSide } from "../ik/sincroArmIkTypes";
import { runSincroCcdIkProbe, type SincroCcdIkProbeResult } from "../ik/sincroCcdIkProbe";
import type { TemporalArmIkBridgeResult } from "../motionSolver/temporalArmSolverBridge";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import { retargetPoseArm } from "./sincroPoseArmRetargeter";
import {
    blendQuaternion,
    cloneArmIkConstraint,
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
    type SincroPoseRetargetedArm,
    type SincroPoseRetargetFrame,
} from "./sincroPoseRetargetTypes";
import {
    createSincroPoseUpperBodyAnchor,
    createSincroPoseUpperBodyFrame,
} from "./sincroPoseRetargetUpperBody";
import { createSincroPoseTemporalArmInput } from "./sincroPoseTemporalArmInput";

/**
 * production retarget が optional に受け取る temporal arm solver 用 runtime input。
 *
 * `temporal` または `profile` が欠損しても retarget は例外にせず、arm ごとの
 * `solverSource` に `temporal_input_missing` / `avatar_profile_missing` を残して
 * Pose snapshot fallback へ戻す。caller はこの境界に保存可能な plain snapshot だけを渡し、
 * VRM bone、Three.js object、MediaPipe raw result は含めない。
 */
export type SincroPoseRetargetRuntimeInput = {
    temporal?: TemporalUpperBodyState;
    profile?: MinimalAvatarMotionProfile;
};

export type {
    ComposerSemanticFingerApplicationMode,
    SincroPoseArmIkMode,
    SincroPoseArmSolverPrimarySource,
    SincroPoseArmSolverSource,
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
    private armIkPrimarySources: Partial<
        Record<SincroArmSide, "temporal" | "pose-snapshot-fallback">
    > = {};
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

    /**
     * `sincro` の pose snapshot と optional runtime input から、その frame の retarget result を作る。
     *
     * 第 3 引数が欠損している場合は従来どおり Pose snapshot arm target を使う。`temporal` と `profile`
     * が揃う frame では Temporal bridge 由来の肩ローカル target を primary IK target にし、欠損や
     * invalid/lost は arm ごとの `solverSource` に理由を残して Pose snapshot fallback へ戻す。
     */
    retarget(
        snapshot: SincroPoseMotionSnapshot,
        nowMs: number,
        runtime?: SincroPoseRetargetRuntimeInput,
    ): SincroPoseRetargetFrame {
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
        const leftArm = this.retargetArm({ snapshot, side: "left", runtime });
        const rightArm = this.retargetArm({ snapshot, side: "right", runtime });
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
        this.armIkPrimarySources = {};
        this.armIkSolvers?.left.resetPoleHistory();
        this.armIkSolvers?.right.resetPoleHistory();
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

    private retargetArm(options: {
        snapshot: SincroPoseMotionSnapshot;
        side: SincroArmSide;
        runtime?: SincroPoseRetargetRuntimeInput;
    }): SincroPoseRetargetedArm {
        const { snapshot, side, runtime } = options;
        const arm = side === "left" ? snapshot.leftArm : snapshot.rightArm;
        const temporalInput = createSincroPoseTemporalArmInput({
            snapshot,
            temporal: runtime?.temporal,
            profile: runtime?.profile,
            solver: this.armIkSolvers?.[side],
            side,
        });
        const solver = this.armIkSolvers?.[side];
        if (
            temporalInput.target !== undefined &&
            solver !== undefined &&
            this.config.armIkMode === "world_3d_ik" &&
            this.config.armIkStrength > 0
        ) {
            this.prepareArmIkPrimarySource(side, "temporal", solver);
            const solved = solver.solve(temporalInput.target);
            if (solved !== undefined) {
                return {
                    ...this.createWorldIkArm({
                        featureArm: this.createFeatureArm(snapshot, side),
                        ikResult: solved,
                    }),
                    solverSource: temporalInput.source,
                    temporalBridge: temporalInput.bridge,
                    reach: createArmReachSnapshot(temporalInput.bridge, solved),
                };
            }
            this.prepareArmIkPrimarySource(side, "pose-snapshot-fallback", solver);
            return {
                ...retargetPoseArm({
                    arm,
                    side,
                    config: this.config,
                    armIkSolvers: this.armIkSolvers,
                }),
                solverSource: {
                    primarySource: "pose-snapshot-fallback",
                    fallbackReason: "invalid_temporal_arm",
                    bridgeReasonCodes: ["invalid_temporal_arm"],
                    targetReachRatio: temporalInput.source.targetReachRatio,
                    temporalState: temporalInput.source.temporalState,
                },
                temporalBridge: temporalInput.bridge,
            };
        }
        if (solver !== undefined) {
            this.prepareArmIkPrimarySource(side, "pose-snapshot-fallback", solver);
        }
        return {
            ...retargetPoseArm({
                arm,
                side,
                config: this.config,
                armIkSolvers: this.armIkSolvers,
            }),
            solverSource: temporalInput.source,
            temporalBridge: temporalInput.bridge,
        };
    }

    private prepareArmIkPrimarySource(
        side: SincroArmSide,
        source: "temporal" | "pose-snapshot-fallback",
        solver: SincroArmIkSolver,
    ): void {
        const previous = this.armIkPrimarySources[side];
        if (previous !== undefined && previous !== source) {
            solver.resetPoleHistory();
        }
        this.armIkPrimarySources[side] = source;
    }

    private createFeatureArm(
        snapshot: SincroPoseMotionSnapshot,
        side: SincroArmSide,
    ): SincroPoseRetargetedArm {
        const arm = side === "left" ? snapshot.leftArm : snapshot.rightArm;
        return retargetPoseArm({
            arm,
            side,
            config: {
                ...this.config,
                armIkMode: "feature_only",
            },
            armIkSolvers: this.armIkSolvers,
        });
    }

    private createWorldIkArm(options: {
        featureArm: SincroPoseRetargetedArm;
        ikResult: SincroArmIkSolveResult;
    }): SincroPoseRetargetedArm {
        const { featureArm, ikResult } = options;
        const ikBlendWeight = this.config.armIkStrength * ikResult.weight;
        return {
            active: true,
            ikActive: true,
            ikWeight: ikResult.weight,
            ikSolverMode: "world_3d_ik",
            fallbackReason:
                ikResult.constraint.reasons[0] ??
                (ikResult.targetClamped ? "ik_target_clamped" : undefined),
            constraint: cloneArmIkConstraint(ikResult.constraint),
            upperArm: { x: 0, y: 0, z: 0 },
            lowerArm: { x: 0, y: 0, z: 0 },
            wrist: { ...featureArm.wrist },
            upperArmQuaternion: blendQuaternion(
                ikResult.neutralUpperArmQuaternion,
                ikResult.upperArmQuaternion,
                ikBlendWeight,
            ),
            lowerArmQuaternion: blendQuaternion(
                ikResult.neutralLowerArmQuaternion,
                ikResult.lowerArmQuaternion,
                ikBlendWeight,
            ),
        };
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

/**
 * bridge clamp 前の要求値と solver が最終適用した target を一つの診断値へ統合する。
 * 両方が clamp した frame は二重計上せず solver ownership を優先する。
 */
function createArmReachSnapshot(
    bridge: TemporalArmIkBridgeResult | undefined,
    solved: SincroArmIkSolveResult,
): SincroPoseRetargetedArm["reach"] {
    if (
        bridge?.reach === undefined ||
        solved.appliedReachRatio === undefined ||
        !Number.isFinite(solved.appliedReachRatio)
    ) {
        return undefined;
    }
    const requestedReachRatio = bridge.reach.requestedReachRatio;
    const appliedReachRatio = solved.appliedReachRatio;
    return {
        requestedReachRatio,
        appliedReachRatio,
        excessReachRatio: Math.max(0, requestedReachRatio - appliedReachRatio),
        clampedBy: solved.reachClamped ? "solver" : bridge.reach.bridgeClamped ? "bridge" : "none",
    };
}
