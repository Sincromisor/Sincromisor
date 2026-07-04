import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type { CharacterBehaviorSnapshot } from "../behavior/characterBehaviorTypes";
import type {
    ComposerArmApplicationMode,
    SincroPoseRetargetFrame,
} from "../retargeting/sincroPoseRetargetTypes";
import type { SincroVrmPoseComposerDryRunResult } from "../runtime/sincroVrmPoseComposerDryRun";
import type { VrmPoseQuaternion } from "../vrmPose/vrmPoseTypes";
import { applyArmHandPose } from "./armBoneHandPose";
import { applyArmBoneRotations } from "./armBoneRotationPose";
import { ArmSpeechGestureState, getArmSpeechExpressionProfile } from "./armBoneSpeechGesture";
import { CHARACTER_IDLE_MOTION_CONFIG, sineWave } from "./characterMotionConfig";

/*
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

/**
 * ArmBoneController が direct write 後に composer arm application を試すための入力境界。
 *
 * caller は production dry-run result をそのまま渡す。mode `"off"` では controller が
 * `composerDryRun.status` や `result` を読まないため、既存 direct write 経路の失敗条件や warning は増えない。
 */
export type ComposerArmApplicationInput = {
    mode: ComposerArmApplicationMode;
    composerDryRun: SincroVrmPoseComposerDryRunResult;
};

/**
 * ArmBoneController の毎 frame 更新結果。
 *
 * 現時点の observable output は Debug Console に流す composer arm application warning だけである。
 * 空配列は direct write 完了、または composer 適用対象がすべて正常に上書きされたことを表す。
 */
export type ArmBoneControllerUpdateResult = {
    composerArmApplicationWarnings: string[];
};

type ArmSide = "left" | "right";

const COMPOSER_ARM_BONES = {
    left: ["leftUpperArm", "leftLowerArm", "leftHand"],
    right: ["rightUpperArm", "rightLowerArm", "rightHand"],
} as const satisfies Record<ArmSide, readonly VRMHumanBoneName[]>;

/**
 * 腕・手・親指の既定ポーズを作る controller。
 *
 * 通常経路は待機姿勢、speech gesture、pose retarget の direct bone write で完結する。
 * `composerArmApplicationMode` が `"off"` 以外の developer 実験時だけ、direct write 後に対象腕の
 * upperArm / lowerArm / hand を composer dry-run の `finalPose` で上書きする。dry-run が unavailable、
 * result、対象 bone quaternion、normalized bone node が欠損する場合は direct write の結果を残し、
 * Debug Console 用 warning を返す。
 * `vrm.humanoid.setNormalizedPose()` は呼ばず、torso / shoulder / finger / head / expression も所有しない。
 */
export class ArmBoneController {
    private vrm: VRM;
    private speechGestureState = new ArmSpeechGestureState();

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    /**
     * 毎フレーム、腕の基準待機ポーズへ低振幅の idle offset を足して適用する。
     *
     * `composerArmApplication` が省略、または mode `"off"` の場合は既存 direct write 経路だけを実行し、
     * dry-run status や result は読まない。mode が有効な場合も direct write を先に完了させるため、
     * composer result 欠損時の fallback は追加書き込みなしで成立する。
     */
    update(
        elapsedSeconds: number,
        snapshot?: CharacterBehaviorSnapshot,
        pose?: SincroPoseRetargetFrame,
        composerArmApplication?: ComposerArmApplicationInput,
    ): ArmBoneControllerUpdateResult {
        const idleMotion = createIdleArmMotion(elapsedSeconds);
        const poseControlsLeftArm = pose?.leftArm.ikActive ?? false;
        const poseControlsRightArm = pose?.rightArm.ikActive ?? false;
        const poseControlsAnyArm = poseControlsLeftArm || poseControlsRightArm;
        const speechGesture =
            snapshot && !poseControlsAnyArm
                ? this.speechGestureState.update(elapsedSeconds, snapshot)
                : 0;
        const expression = getArmSpeechExpressionProfile(snapshot?.aiSpeech.expressionCode);
        const leftGesture = poseControlsLeftArm
            ? 0
            : speechGesture * (this.speechGestureState.side < 0 ? 1 : 0.42);
        const rightGesture = poseControlsRightArm
            ? 0
            : speechGesture * (this.speechGestureState.side > 0 ? 1 : 0.42);
        const leftIdleScale = poseControlsLeftArm ? 0.22 : 1;
        const rightIdleScale = poseControlsRightArm ? 0.22 : 1;

        const armRotationNodes = {
            leftUpperArm: this.getNode("leftUpperArm"),
            rightUpperArm: this.getNode("rightUpperArm"),
            leftLowerArm: this.getNode("leftLowerArm"),
            rightLowerArm: this.getNode("rightLowerArm"),
        };
        const armHandNodes = {
            leftHand: this.getNode("leftHand"),
            leftThumbProximal: this.getNode("leftThumbProximal"),
            rightHand: this.getNode("rightHand"),
            rightThumbProximal: this.getNode("rightThumbProximal"),
        };

        applyArmBoneRotations({
            nodes: {
                leftUpperArm: armRotationNodes.leftUpperArm,
                rightUpperArm: armRotationNodes.rightUpperArm,
                leftLowerArm: armRotationNodes.leftLowerArm,
                rightLowerArm: armRotationNodes.rightLowerArm,
            },
            pose,
            armSway: idleMotion.armSway,
            elbowSway: idleMotion.elbowSway,
            leftGesture,
            rightGesture,
            leftIdleScale,
            rightIdleScale,
            expression,
        });

        applyArmHandPose({
            nodes: {
                leftHand: armHandNodes.leftHand,
                leftThumbProximal: armHandNodes.leftThumbProximal,
                rightHand: armHandNodes.rightHand,
                rightThumbProximal: armHandNodes.rightThumbProximal,
            },
            pose,
            wristSway: idleMotion.wristSway,
            leftGesture,
            rightGesture,
            leftIdleScale,
            rightIdleScale,
            expression,
        });

        return {
            composerArmApplicationWarnings: applyComposerArmApplication({
                mode: composerArmApplication?.mode ?? "off",
                composerDryRun: composerArmApplication?.composerDryRun,
                nodes: {
                    leftUpperArm: armRotationNodes.leftUpperArm,
                    leftLowerArm: armRotationNodes.leftLowerArm,
                    leftHand: armHandNodes.leftHand,
                    rightUpperArm: armRotationNodes.rightUpperArm,
                    rightLowerArm: armRotationNodes.rightLowerArm,
                    rightHand: armHandNodes.rightHand,
                },
            }),
        };
    }

    private getNode(name: VRMHumanBoneName): Object3D | undefined {
        return this.vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
    }
}

type ComposerArmApplicationState = {
    mode: ComposerArmApplicationMode;
    composerDryRun?: SincroVrmPoseComposerDryRunResult;
    nodes: Partial<Record<(typeof COMPOSER_ARM_BONES)[ArmSide][number], Object3D | undefined>>;
};

/*
    composer arm application は direct write の後段だけを差し替える。
    mode off では dry-run availability すら読まず、mode 有効時も fallback reason を Debug Console へ返すだけで
    neutral pose や full normalized pose 適用へは拡張しない。
*/
function applyComposerArmApplication(input: ComposerArmApplicationState): string[] {
    if (input.mode === "off") {
        return [];
    }

    if (input.composerDryRun?.status !== "available") {
        return [
            `composer_arm_application_unavailable:${input.composerDryRun?.status ?? "missing"}`,
        ];
    }

    if (input.composerDryRun.result === undefined) {
        return ["composer_arm_application_result_missing"];
    }

    const warnings: string[] = [];
    for (const side of targetSides(input.mode)) {
        for (const bone of COMPOSER_ARM_BONES[side]) {
            const quaternion = input.composerDryRun.result.finalPose[bone];
            const node = input.nodes[bone];
            if (quaternion === undefined) {
                warnings.push(`composer_arm_application_final_pose_missing:${bone}`);
                continue;
            }
            if (!node) {
                warnings.push(`composer_arm_application_normalized_node_missing:${bone}`);
                continue;
            }
            copyComposerQuaternion(node, quaternion);
        }
    }
    return warnings;
}

function targetSides(mode: Exclude<ComposerArmApplicationMode, "off">): ArmSide[] {
    switch (mode) {
        case "left":
            return ["left"];
        case "right":
            return ["right"];
        case "both":
            return ["left", "right"];
    }
}

function copyComposerQuaternion(node: Object3D, value: VrmPoseQuaternion): void {
    node.quaternion.copy(new Quaternion(value.x, value.y, value.z, value.w).normalize());
}

type IdleArmMotion = {
    armSway: number;
    elbowSway: number;
    wristSway: number;
};

function createIdleArmMotion(elapsedSeconds: number): IdleArmMotion {
    return {
        armSway: sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.arms.swayPeriodSeconds,
            Math.PI / 5,
        ),
        elbowSway: sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.arms.elbowPeriodSeconds,
            Math.PI / 2,
        ),
        wristSway: sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.arms.wristPeriodSeconds,
            Math.PI / 9,
        ),
    };
}
