import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { Euler } from 'three/src/math/Euler.js';
import { Object3D } from 'three/src/core/Object3D.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { CHARACTER_IDLE_MOTION_CONFIG, sineWave } from './CharacterMotionConfig';
import { CharacterBehaviorSnapshot } from './CharacterBehaviorState';

type OptionalBoneName = 'hips' | 'spine' | 'chest' | 'upperChest' | 'leftShoulder' | 'rightShoulder';

type MotionBone = {
    node: Object3D;
    baseRotation: Euler;
};

// 呼吸、重心移動、肩周りの小さな idle motion をまとめて適用する。
// 腕/脚の固定姿勢 controller と競合しないよう、胴体・肩・hips の基準姿勢に offset だけを足す。
export class CharacterMotionOrchestrator {
    private readonly bones = new Map<OptionalBoneName, MotionBone>();

    constructor(vrm: VRM) {
        this.captureOptionalBone(vrm, 'hips');
        this.captureOptionalBone(vrm, 'spine');
        this.captureOptionalBone(vrm, 'chest');
        this.captureOptionalBone(vrm, 'upperChest');
        this.captureOptionalBone(vrm, 'leftShoulder');
        this.captureOptionalBone(vrm, 'rightShoulder');
    }

    update(elapsedSeconds: number, snapshot: CharacterBehaviorSnapshot, hipsBasePosition: Vector3): void {
        const breath = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.breath.periodSeconds);
        const breathSecondary = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.breath.periodSeconds, Math.PI / 2);
        const balanceSide = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.balance.sidePeriodSeconds, Math.PI / 7);
        const balanceFront = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.balance.frontPeriodSeconds, Math.PI / 3);
        const intensity = this.intensityForState(snapshot);

        this.updateHips(hipsBasePosition, balanceSide, balanceFront, intensity);
        this.updateSpine(breath, balanceSide, intensity);
        this.updateChest(breath, breathSecondary, intensity);
        this.updateShoulders(breath, breathSecondary, intensity);
    }

    private captureOptionalBone(vrm: VRM, name: OptionalBoneName): void {
        const node = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
        if (!node) {
            return;
        }
        this.bones.set(name, {
            node,
            baseRotation: node.rotation.clone(),
        });
    }

    private updateHips(basePosition: Vector3, sideWave: number, frontWave: number, intensity: number): void {
        const bone = this.bones.get('hips');
        if (!bone) {
            return;
        }
        bone.node.position.set(
            basePosition.x + sideWave * CHARACTER_IDLE_MOTION_CONFIG.balance.hipsSideShift * intensity,
            basePosition.y,
            basePosition.z + frontWave * CHARACTER_IDLE_MOTION_CONFIG.balance.hipsFrontShift * intensity,
        );
        bone.node.rotation.set(
            bone.baseRotation.x,
            bone.baseRotation.y,
            bone.baseRotation.z + sideWave * CHARACTER_IDLE_MOTION_CONFIG.balance.hipsRollRad * intensity,
        );
    }

    private updateSpine(breathWave: number, sideWave: number, intensity: number): void {
        const bone = this.bones.get('spine');
        if (!bone) {
            return;
        }
        bone.node.rotation.set(
            bone.baseRotation.x - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.spinePitchRad * intensity,
            bone.baseRotation.y + sideWave * CHARACTER_IDLE_MOTION_CONFIG.balance.spineYawRad * intensity,
            bone.baseRotation.z,
        );
    }

    private updateChest(breathWave: number, secondaryWave: number, intensity: number): void {
        const chest = this.bones.get('chest');
        if (chest) {
            chest.node.rotation.set(
                chest.baseRotation.x - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.chestPitchRad * intensity,
                chest.baseRotation.y,
                chest.baseRotation.z + secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad * intensity,
            );
        }

        const upperChest = this.bones.get('upperChest');
        if (upperChest) {
            upperChest.node.rotation.set(
                upperChest.baseRotation.x - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.upperChestPitchRad * intensity,
                upperChest.baseRotation.y,
                upperChest.baseRotation.z - secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad * 0.65 * intensity,
            );
        }
    }

    private updateShoulders(breathWave: number, secondaryWave: number, intensity: number): void {
        const left = this.bones.get('leftShoulder');
        if (left) {
            left.node.rotation.set(
                left.baseRotation.x,
                left.baseRotation.y,
                left.baseRotation.z - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad * intensity
                    + secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad * intensity,
            );
        }

        const right = this.bones.get('rightShoulder');
        if (right) {
            right.node.rotation.set(
                right.baseRotation.x,
                right.baseRotation.y,
                right.baseRotation.z + breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad * intensity
                    + secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad * intensity,
            );
        }
    }

    private intensityForState(snapshot: CharacterBehaviorSnapshot): number {
        if (snapshot.state === 'error_or_disconnected') {
            return 0.45;
        }
        if (snapshot.state === 'ai_speaking' || snapshot.state === 'user_speaking') {
            return 0.75;
        }
        return 1;
    }
}
