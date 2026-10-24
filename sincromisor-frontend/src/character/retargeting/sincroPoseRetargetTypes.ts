import { MathUtils } from "three";
import type { SincroArmIkConstraintSnapshot } from "../ik/sincroArmIkConstraint";
import type { SincroArmIkQuaternion } from "../ik/sincroArmIkSolver";
import type { SincroCcdIkProbeResult } from "../ik/sincroCcdIkProbe";
import type { TemporalArmIkBridgeResult } from "../motionSolver/temporalArmSolverBridge";
import type { TemporalPartState } from "../temporal/temporalUpperBodyState";

/**
 * 腕 IK target を temporal bridge で解決したか、Pose snapshot 互換 fallback へ戻したかを表す。
 *
 * この値は Phase 6 debug snapshot と replay 保存境界へ出す plain string contract であり、
 * VRM / Three.js object や solver instance は含めない。`"pose-snapshot-fallback"` は temporal
 * 入力、avatar profile、IK solver 測定値、bridge target のいずれかが欠損または invalid/lost の
 * frame だけで使う。
 */
export type SincroPoseArmSolverPrimarySource = "temporal" | "pose-snapshot-fallback";

/**
 * production retarget が腕 IK target の選択理由を保存・debug 表示へ渡すための source snapshot。
 *
 * `fallbackReason` は fallback 時の代表理由、`bridgeReasonCodes` は同じ frame で観測した欠損や
 * bridge diagnostic を欠落させず保存するための詳細理由である。temporal primary でも clamp や
 * recovering 由来の reason code を保持し、`targetReachRatio` と `temporalState` は replay で
 * reach clamp occupancy や recovery jump を比較できる最小情報に限る。
 */
export type SincroPoseArmSolverSource = {
    primarySource: SincroPoseArmSolverPrimarySource;
    fallbackReason?: string;
    bridgeReasonCodes: string[];
    targetReachRatio?: number;
    temporalState?: TemporalPartState;
};

export type SincroPoseArmIkMode = "feature_only" | "screen_space_ik" | "world_3d_ik";

export type SincroPoseRetargetedArm = {
    /** 欠損予測が期限へ近づく間、腕を下ろす代替層へ連続的に戻す重み。 */
    trackingWeight?: number;
    active: boolean;
    ikActive: boolean;
    ikWeight: number;
    ikSolverMode: SincroPoseArmIkMode | "none";
    fallbackReason?: string;
    solverSource?: SincroPoseArmSolverSource;
    temporalBridge?: TemporalArmIkBridgeResult;
    reach?: {
        requestedReachRatio: number;
        appliedReachRatio: number;
        excessReachRatio: number;
        clampedBy: "bridge" | "solver" | "none";
    };
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
        /** 中立基底との差。合成時にプロファイルで配分する任意の正規化回転。 */
        torsoQuaternion?: { x: number; y: number; z: number; w: number };
        spine: { x: number; y: number; z: number };
        chest: { x: number; y: number; z: number };
        leftShoulder: { x: number; y: number; z: number };
        rightShoulder: { x: number; y: number; z: number };
    };
    leftArm: SincroPoseRetargetedArm;
    rightArm: SincroPoseRetargetedArm;
};

/** 姿勢変換と腕IKの調整値。意味に基づく動作・指の層生成は合成サービスが入力から判断する。 */
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

/** 本番の姿勢変換に使う既定値。角度はラジアン、追従と中立復帰の時間はミリ秒。 */
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

export const NEUTRAL_ARM_IK_CONSTRAINT: SincroArmIkConstraintSnapshot = {
    reasons: [],
    jointLimited: false,
    poleStabilized: false,
    collisionAvoided: false,
    weightScale: 1,
    targetPushDistance: 0,
};

export const NEUTRAL_POSE_FRAME: SincroPoseRetargetFrame = {
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
