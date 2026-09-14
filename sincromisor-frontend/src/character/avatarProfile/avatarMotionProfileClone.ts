/** 生成・保存・再生が共有する純粋な複製処理。Three.jsのオブジェクトは扱わない。 */
import {
    AVATAR_MOTION_PROFILE_BONE_NAMES,
    type AvatarMotionProfile,
    type AvatarMotionSide,
} from "./avatarMotionProfileTypes";

/** 既知のボーン回転と入れ子のデータを複製し、呼び出し元による変更を元データへ伝えない。 */
export function cloneAvatarMotionProfile(profile: AvatarMotionProfile): AvatarMotionProfile {
    return {
        schemaVersion: profile.schemaVersion,
        model: { ...profile.model },
        capabilities: {
            bones: { ...profile.capabilities.bones },
            fingerChains: {
                left: cloneFingerChain(profile.capabilities.fingerChains.left),
                right: cloneFingerChain(profile.capabilities.fingerChains.right),
            },
        },
        restLocalRotation: cloneRestLocalRotation(profile.restLocalRotation),
        metrics: {
            shoulderWidth: profile.metrics.shoulderWidth,
            torsoLength: profile.metrics.torsoLength,
            headSize: profile.metrics.headSize,
            upperArmLength: { ...profile.metrics.upperArmLength },
            lowerArmLength: { ...profile.metrics.lowerArmLength },
            handSize: { ...profile.metrics.handSize },
        },
        torso: {
            distribution: { ...profile.torso.distribution },
            chestFollow: profile.torso.chestFollow,
        },
        arm: { ...profile.arm },
        wrist: { ...profile.wrist },
        fingers: {
            curlScale: profile.fingers.curlScale,
            curlMode: profile.fingers.curlMode,
            curlDistribution: { ...profile.fingers.curlDistribution },
            splayLimitDeg: profile.fingers.splayLimitDeg,
        },
        risk: { ...profile.risk },
        warnings: [...profile.warnings],
    };
}

function cloneFingerChain(
    chain: AvatarMotionProfile["capabilities"]["fingerChains"][AvatarMotionSide],
): AvatarMotionProfile["capabilities"]["fingerChains"][AvatarMotionSide] {
    return {
        thumb: { ...chain.thumb },
        index: { ...chain.index },
        middle: { ...chain.middle },
        ring: { ...chain.ring },
        little: { ...chain.little },
    };
}

function cloneRestLocalRotation(
    rotations: AvatarMotionProfile["restLocalRotation"],
): AvatarMotionProfile["restLocalRotation"] {
    const cloned: AvatarMotionProfile["restLocalRotation"] = {};
    for (const boneName of AVATAR_MOTION_PROFILE_BONE_NAMES) {
        const rotation = rotations[boneName];
        if (rotation !== undefined) {
            cloned[boneName] = [rotation[0], rotation[1], rotation[2], rotation[3]];
        }
    }
    return cloned;
}
