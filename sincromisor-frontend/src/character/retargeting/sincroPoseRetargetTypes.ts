import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroArmIkConstraintSnapshot } from "../ik/sincroArmIkConstraint";
import type { SincroArmIkQuaternion } from "../ik/sincroArmIkSolver";
import type { SincroCcdIkProbeResult } from "../ik/sincroCcdIkProbe";
import type { TemporalArmIkBridgeResult } from "../motionSolver/temporalArmSolverBridge";
import type { TemporalPartState } from "../temporal/temporalUpperBodyState";

export type SincroPoseArmSolverPrimarySource = "temporal" | "pose-snapshot-fallback";

export type SincroPoseArmSolverSource = {
    primarySource: SincroPoseArmSolverPrimarySource;
    fallbackReason?: string;
    bridgeReasonCodes: string[];
    targetReachRatio?: number;
    temporalState?: TemporalPartState;
};

export type SincroPoseArmIkMode = "feature_only" | "screen_space_ik" | "world_3d_ik";

/**
 * production composer dry-run result を腕表示へどこまで適用するかを切り替える developer flag。
 *
 * `"off"` は既存 direct write と同じ表示経路を保つ安定既定値である。その他の mode は
 * Debug Console / motion-debug からの実験用で、対象腕の upperArm / lowerArm / hand だけを
 * dry-run `available` frame の `finalPose` から適用する。通常設定 UI や保存設定の contract ではない。
 * 所有者は motion runtime であり、full application を唯一の production path にする後続 task で
 * 段階 rollback が不要と判断できた時に削除対象へ移す。
 */
export type ComposerArmApplicationMode = "off" | "left" | "right" | "both";

/**
 * torso / shoulder の本番表示を direct controller と composer selected-bone overwrite で切り替える flag。
 *
 * `"direct"` は `CharacterMotionTorsoApplier` の spine / chest / upperChest / shoulder direct write を
 * そのまま使う rollback 既定値である。`"composer"` は direct write を行わず、同じ motion input から作った
 * composer layer の `finalPose` を torso / shoulder と missing shoulder fallback の upperArm だけへ適用する。
 * arm application flag とは独立しており、head / neck / leg / expression / finger は対象外に固定する。
 * 所有者は motion runtime であり、torso / shoulder の direct controller rollback を廃止できる実機確認が
 * 揃うまで Debug Console 限定の復旧 hook として残す。
 */
export type ComposerTorsoShoulderApplicationMode = "direct" | "composer";

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

/**
 * production dry-run の `finalPose` を `setNormalizedPose()` へ全面適用する developer rollback flag。
 *
 * `"off"` は arm / torso / shoulder / semantic / finger の段階別適用を維持する既定値である。
 * `"upper_body"` は dry-run が同一 frame で `available` result を返す場合だけ、upper body finalPose を
 * `VRMCharacterManager.update()` から 1 回適用する。通常設定 UI や永続設定 contract には広げない。
 * 所有者は motion runtime であり、full application を常時有効化しても P0 replay と複数 VRM 実機確認が
 * 継続 PASS するまでは、段階別 path へ戻す rollback hook として残す。
 */
export type FullNormalizedPoseApplicationMode = "off" | "upper_body";

export type SincroPoseRetargetedArm = {
    active: boolean;
    ikActive: boolean;
    ikWeight: number;
    ikSolverMode: SincroPoseArmIkMode | "none";
    fallbackReason?: string;
    solverSource?: SincroPoseArmSolverSource;
    temporalBridge?: TemporalArmIkBridgeResult;
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
     * VrmPoseComposer dry-run result を本番腕表示へ限定適用する developer flag。
     *
     * 既定の `"off"` は現行 ArmBoneController direct write と同じ経路を維持し、composer result の
     * availability 確認や fallback warning 生成も行わない。`"left"` / `"right"` / `"both"` は
     * dry-run が `available` の frame だけ対象腕の upperArm / lowerArm / hand を composer `finalPose`
     * の quaternion で上書きする実験経路であり、torso / shoulder / finger / head / expression は対象外。
     * Debug Console 限定の rollback hook であり、runtime ownership map の arm cleanup が完了したら削除する。
     */
    composerArmApplicationMode: ComposerArmApplicationMode;
    /**
     * torso / shoulder の composer 移行を切り替える developer flag。
     *
     * 既定の `"direct"` は `CharacterMotionTorsoApplier` direct write を必ず残す safe default。
     * `"composer"` は `AvatarMotionProfile.torso.distribution` と optional bone capability を正本にして、
     * selected torso / shoulder bone だけを composer `finalPose` から上書きする。arm flag の mode は
     * この値を暗黙に変更しない。
     * Debug Console 限定の rollback hook であり、direct torso controller の復旧手順を廃止できるまで残す。
     */
    composerTorsoShoulderApplicationMode: ComposerTorsoShoulderApplicationMode;
    /**
     * semantic / finger の composer layer 接続を切り替える developer rollback flag。
     *
     * 既定の `"composer"` は production semantic/finger application stage を有効にし、valid snapshot が
     * 揃わない frame では warning 付きで layer を追加しない。`"off"` は MotionIntent / Hand 推定自体は
     * observe-only に残したまま composer input から semantic / finger layer だけを外す。
     * Debug Console 限定の rollback hook であり、semantic / finger layer の rollback 不要化と同時に削除する。
     */
    composerSemanticFingerApplicationMode: ComposerSemanticFingerApplicationMode;
    /**
     * upper body composer finalPose の full normalized pose 適用を切り替える developer rollback flag。
     *
     * 既定の `"off"` は直前 pass stage の段階別 application path をそのまま使い、前段 flag は
     * 暗黙に変更しない。`"upper_body"` は dry-run が current frame の available result を持つ場合だけ
     * `setNormalizedPose(finalPose)` を 1 回呼び、unavailable / invalid / missing profile では stale result を
     * 昇格せず段階別 path へ戻す。
     * Debug Console 限定の rollback hook であり、full application の常時有効化 task までは削除しない。
     */
    fullNormalizedPoseApplicationMode: FullNormalizedPoseApplicationMode;
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
    composerArmApplicationMode: "off",
    composerTorsoShoulderApplicationMode: "direct",
    composerSemanticFingerApplicationMode: "composer",
    fullNormalizedPoseApplicationMode: "off",
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
