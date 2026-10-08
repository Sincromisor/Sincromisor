import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfileTypes";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type {
    SincroPoseRetargetedArm,
    SincroPoseRetargetFrame,
} from "../retargeting/sincroPoseRetargeter";
import { CHARACTER_ARM_REST_POSE } from "../vrmCharacter/characterMotionConfig";
import { createTorsoFallbackLayer } from "../vrmPose/vrmPoseTorsoFallback";
import type {
    VrmNormalizedLocalPose,
    VrmPoseLayer,
    VrmPoseQuaternion,
} from "../vrmPose/vrmPoseTypes";
import type { SincroVrmPoseComposerInput } from "./sincroVrmPoseComposer";
import {
    createSemanticFingerComposerLayers,
    type SincroVrmPoseComposerSemanticFingerState,
} from "./sincroVrmPoseComposerSemanticFingerLayers";

/** 追跡が無効なフレームでも代替姿勢で埋める上半身のボーン。 */
const FALLBACK_BONES: VRMHumanBoneName[] = [
    "spine",
    "chest",
    "upperChest",
    "leftShoulder",
    "rightShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
];

/** 旧追跡フレームのボーン一覧。左右の抽出に使い、体幹の三分配は別の追跡層が所有する。 */
const TRACKING_BONES: VRMHumanBoneName[] = [
    "spine",
    "chest",
    "leftShoulder",
    "rightShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
];

// 代替・追跡層へ意味に基づく動作と指の層を追加し、警告と次回の指保持状態を返す。
export function createComposerLayers(
    frame: SincroPoseRetargetFrame,
    profile: AvatarMotionProfile | MinimalAvatarMotionProfile,
    semanticFinger: SincroVrmPoseComposerInput["semanticFinger"],
    state: SincroVrmPoseComposerSemanticFingerState,
): { layers: VrmPoseLayer[]; warnings: string[]; previousFinger: typeof state.previousFinger } {
    const semanticFingerResult = createSemanticFingerComposerLayers(profile, semanticFinger, state);
    return {
        layers: [
            ...createBaseComposerLayers(frame, profile, semanticFinger),
            ...semanticFingerResult.layers,
        ],
        warnings: semanticFingerResult.warnings,
        previousFinger: semanticFingerResult.previousFinger,
    };
}

// 追跡が無効なら重みを0にし、同じフレームの代替姿勢を合成結果に残す。
function createBaseComposerLayers(
    frame: SincroPoseRetargetFrame,
    profile: AvatarMotionProfile | MinimalAvatarMotionProfile,
    semanticFinger?: SincroVrmPoseComposerInput["semanticFinger"],
): VrmPoseLayer[] {
    const torso =
        frame.upperBody.torsoQuaternion &&
        profile.schemaVersion === "sincro.avatar-motion-profile.v1"
            ? createTorsoFallbackLayer({
                  id: "production:tracking",
                  kind: "tracking",
                  profile,
                  delta: frame.upperBody.torsoQuaternion,
                  weight: frame.active ? 1 : 0,
              })
            : undefined;
    return [
        {
            id: "production:fallback",
            kind: "fallback",
            blendMode: "override",
            weight: 1,
            pose: createFallbackPose(),
            ownedBones: [...FALLBACK_BONES],
        },
        torso
            ? { ...torso, blendMode: "override" }
            : {
                  id: "production:tracking",
                  kind: "tracking",
                  blendMode: "override",
                  weight: frame.active ? 1 : 0,
                  pose: {
                      spine: eulerQuaternion(frame.upperBody.spine),
                      chest: eulerQuaternion(frame.upperBody.chest),
                  },
                  ownedBones: ["spine", "chest"],
              },
        ...(["left", "right"] as const).map((side) => {
            const bones = TRACKING_BONES.filter((bone) => bone.startsWith(side));
            const arm = side === "left" ? frame.leftArm : frame.rightArm;
            const pose = createTrackingPose(frame);
            return {
                id: `production:tracking:${side}`,
                kind: "tracking" as const,
                blendMode: "override" as const,
                weight: arm.active ? (arm.trackingWeight ?? 1) : 0,
                // 予測の適用重みを観測信頼度と混ぜず、同じPose時計で実観測からの年齢を渡す。
                metadata: {
                    tracking: {
                        confidence:
                            semanticFinger?.temporal?.arms[side].confidence ??
                            (arm.active ? frame.confidence : 0),
                        observedAgeMs: semanticFinger?.temporal
                            ? semanticFinger.temporal.arms[side].observedAgeMs +
                              Math.max(
                                  0,
                                  (semanticFinger.poseMediaTimeMs ??
                                      semanticFinger.temporal.timestamp.mediaTimeMs) -
                                      semanticFinger.temporal.timestamp.mediaTimeMs,
                              )
                            : 0,
                    },
                },
                ownedBones: bones,
                pose: Object.fromEntries(bones.map((bone) => [bone, pose[bone]])),
            };
        }),
    ];
}

/*
    追跡 frame が無効でも現在 frame の結果を生成し、前回の追跡姿勢を残さない。
    torso / shoulder は正規化基準へ戻す一方、腕は T ポーズを避けるため既定の待機姿勢へ戻す。
*/
function createFallbackPose(): VrmNormalizedLocalPose {
    const pose: VrmNormalizedLocalPose = {};
    for (const bone of FALLBACK_BONES) {
        pose[bone] = identityQuaternion();
    }
    pose.leftUpperArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.left.upperArm);
    pose.leftLowerArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.left.lowerArm);
    pose.leftHand = eulerQuaternion(CHARACTER_ARM_REST_POSE.left.hand);
    pose.rightUpperArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.right.upperArm);
    pose.rightLowerArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.right.lowerArm);
    pose.rightHand = eulerQuaternion(CHARACTER_ARM_REST_POSE.right.hand);
    return pose;
}

function createTrackingPose(frame: SincroPoseRetargetFrame): VrmNormalizedLocalPose {
    return {
        spine: eulerQuaternion(frame.upperBody.spine),
        chest: eulerQuaternion(frame.upperBody.chest),
        leftShoulder: eulerQuaternion(frame.upperBody.leftShoulder),
        rightShoulder: eulerQuaternion(frame.upperBody.rightShoulder),
        leftUpperArm: armUpperQuaternion(frame.leftArm),
        leftLowerArm: armLowerQuaternion(frame.leftArm),
        leftHand: eulerQuaternion(frame.leftArm.wrist),
        rightUpperArm: armUpperQuaternion(frame.rightArm),
        rightLowerArm: armLowerQuaternion(frame.rightArm),
        rightHand: eulerQuaternion(frame.rightArm.wrist),
    };
}

function armUpperQuaternion(arm: SincroPoseRetargetedArm): VrmPoseQuaternion {
    return arm.upperArmQuaternion ?? eulerQuaternion(arm.upperArm);
}

function armLowerQuaternion(arm: SincroPoseRetargetedArm): VrmPoseQuaternion {
    return arm.lowerArmQuaternion ?? eulerQuaternion(arm.lowerArm);
}

function eulerQuaternion(value: { x: number; y: number; z: number }): VrmPoseQuaternion {
    const quaternion = new Quaternion().setFromEuler(new Euler(value.x, value.y, value.z, "XYZ"));
    return serializeQuaternion(quaternion);
}

function identityQuaternion(): VrmPoseQuaternion {
    return { x: 0, y: 0, z: 0, w: 1 };
}

function serializeQuaternion(quaternion: Quaternion): VrmPoseQuaternion {
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}
