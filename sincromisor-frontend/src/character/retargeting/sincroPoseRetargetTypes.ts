import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroArmIkConstraintSnapshot } from "../ik/sincroArmIkConstraint";
import type { SincroArmIkQuaternion } from "../ik/sincroArmIkSolver";
import type { SincroCcdIkProbeResult } from "../ik/sincroCcdIkProbe";

export type SincroPoseArmIkMode = "feature_only" | "screen_space_ik" | "world_3d_ik";

/**
 * semantic pose / finger curl layer の composer input 接続を切り替える developer rollback flag。
 *
 * `"composer"` は保存済み `MotionIntentState`、低次元 Hand snapshot、完成版 `AvatarMotionProfile` が
 * valid な frame だけ semantic / finger layer を dry-run composer へ追加する。`"off"` は arm / torso
 * flag とは独立に semantic / finger layer だけを外し、既存 tracking / torso composer 検証を維持する。
 * 通常設定 UI や永続設定 contract には広げない。
 * 所有者は motion runtime であり、semantic / finger regression の rollback 手順が不要になった時点で
 * flag と `semantic_finger_application_off` warning を同時に削除する。
 */
export type ComposerSemanticFingerApplicationMode = "off" | "composer";

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
    /**
     * semantic / finger の composer layer 接続を切り替える developer rollback flag。
     *
     * 既定の `"composer"` は production semantic/finger application stage を有効にし、valid snapshot が
     * 揃わない frame では warning 付きで layer を追加しない。`"off"` は MotionIntent / Hand 推定自体は
     * observe-only に残したまま composer input から semantic / finger layer だけを外す。
     * Debug Console 限定の rollback hook であり、semantic / finger layer の rollback 不要化と同時に削除する。
     */
    composerSemanticFingerApplicationMode: ComposerSemanticFingerApplicationMode;
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
    composerSemanticFingerApplicationMode: "composer",
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
