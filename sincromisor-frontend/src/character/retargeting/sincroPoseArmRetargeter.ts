import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseArmTargetSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    type ArmIkSolvers,
    type ArmSide,
    solveScreenSpaceArmIk,
    solveWorldArmIk,
} from "./sincroPoseArmIkSolve";
import {
    blendArm,
    blendQuaternion,
    cloneArm,
    cloneArmIkConstraint,
    positiveOnly,
    withArmFallbackReason,
} from "./sincroPoseRetargetFrame";
import {
    NEUTRAL_ARM_IK_CONSTRAINT,
    NEUTRAL_POSE_FRAME,
    type SincroPoseRetargetConfig,
    type SincroPoseRetargetedArm,
} from "./sincroPoseRetargetTypes";

type RetargetPoseArmOptions = {
    arm: SincroPoseArmMotionSnapshot;
    side: ArmSide;
    config: SincroPoseRetargetConfig;
    armIkSolvers?: ArmIkSolvers;
};

export function retargetPoseArm(options: RetargetPoseArmOptions): SincroPoseRetargetedArm {
    const { arm, side, config, armIkSolvers } = options;
    if (!arm.tracked || arm.confidence < config.minConfidence) {
        return withArmFallbackReason(
            cloneArm(NEUTRAL_POSE_FRAME.leftArm),
            arm.tracked ? "arm_low_confidence" : "arm_not_tracked",
        );
    }
    const sideSign = side === "left" ? -1 : 1;
    const scale = config.intensityScale;
    const featureArm: SincroPoseRetargetedArm = {
        active: true,
        ikActive: false,
        ikWeight: 0,
        ikSolverMode: "feature_only",
        fallbackReason: undefined,
        constraint: cloneArmIkConstraint(NEUTRAL_ARM_IK_CONSTRAINT),
        upperArm: {
            x: -positiveOnly(arm.upperArmLift) * config.upperArmLiftRad * scale,
            y: sideSign * arm.upperArmOpen * config.upperArmOpenRad * scale,
            z: -sideSign * positiveOnly(arm.upperArmLift) * config.upperArmOpenRad * 0.55 * scale,
        },
        lowerArm: {
            x: 0,
            y: sideSign * arm.lowerArmFlex * config.lowerArmFlexRad * scale,
            z: 0,
        },
        wrist: {
            x: 0,
            y: 0,
            z: sideSign * arm.wristRaise * config.wristRaiseRad * scale,
        },
        upperArmQuaternion: undefined,
        lowerArmQuaternion: undefined,
    };

    if (config.armIkMode === "feature_only" || config.armIkStrength <= 0) {
        return {
            ...featureArm,
            fallbackReason: config.armIkMode === "feature_only" ? undefined : "ik_strength_zero",
        };
    }

    if (config.armIkMode === "world_3d_ik") {
        return retargetWorldArmIk({ targets: arm.targets, side, featureArm, config, armIkSolvers });
    }

    return retargetScreenSpaceArmIk({
        targets: arm.targets,
        side,
        featureArm,
        config,
        armIkSolvers,
    });
}

function retargetWorldArmIk(options: {
    targets: SincroPoseArmTargetSnapshot;
    side: ArmSide;
    featureArm: SincroPoseRetargetedArm;
    config: SincroPoseRetargetConfig;
    armIkSolvers?: ArmIkSolvers;
}): SincroPoseRetargetedArm {
    const { targets, side, featureArm, config, armIkSolvers } = options;
    const ikResult = solveWorldArmIk({ targets, side, config, armIkSolvers });
    if (!ikResult.result) {
        return {
            ...featureArm,
            fallbackReason: ikResult.fallbackReason,
        };
    }
    const ikBlendWeight = config.armIkStrength * ikResult.result.weight;
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

function retargetScreenSpaceArmIk(options: {
    targets: SincroPoseArmTargetSnapshot;
    side: ArmSide;
    featureArm: SincroPoseRetargetedArm;
    config: SincroPoseRetargetConfig;
    armIkSolvers?: ArmIkSolvers;
}): SincroPoseRetargetedArm {
    const { targets, side, featureArm, config, armIkSolvers } = options;
    const ikResult = solveScreenSpaceArmIk({ targets, side, config, armIkSolvers });
    if (!ikResult.target) {
        return {
            ...featureArm,
            fallbackReason: ikResult.fallbackReason,
        };
    }
    const sideSign = side === "left" ? -1 : 1;
    const ikScale = config.intensityScale;
    const ikArm: SincroPoseRetargetedArm = {
        active: true,
        ikActive: true,
        ikWeight: ikResult.target.weight,
        ikSolverMode: "screen_space_ik",
        fallbackReason: undefined,
        constraint: cloneArmIkConstraint(NEUTRAL_ARM_IK_CONSTRAINT),
        upperArm: {
            x: -ikResult.target.lift * config.armIkMaxLiftRad * ikScale,
            y: sideSign * ikResult.target.open * config.armIkMaxOpenRad * ikScale,
            z: -sideSign * ikResult.target.pole * config.armIkMaxOpenRad * 0.42 * ikScale,
        },
        lowerArm: {
            x: 0,
            y: sideSign * ikResult.target.flex * config.armIkMaxForearmFlexRad * ikScale,
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
        ...blendArm(featureArm, ikArm, config.armIkStrength * ikResult.target.weight),
        ikActive: true,
        ikWeight: ikResult.target.weight,
        ikSolverMode: "screen_space_ik",
        fallbackReason: undefined,
    };
}
