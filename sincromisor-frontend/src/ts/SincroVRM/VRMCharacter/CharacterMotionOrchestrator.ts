import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { Euler } from 'three/src/math/Euler.js';
import { MathUtils } from 'three/src/math/MathUtils.js';
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
    private listeningBlend = 0;
    private lastElapsedSeconds: number | null = null;
    private lastBackchannelSpeechEndedAtMs: number | null = null;
    private lastBackchannelTriggeredAtMs: number | null = null;
    private nodStartedAtSeconds: number | null = null;
    private nodIntensity = 0;

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
        const listening = this.updateListeningBlend(elapsedSeconds, snapshot);
        const backchannelNod = this.updateBackchannelNod(elapsedSeconds, snapshot);

        this.updateHips(hipsBasePosition, balanceSide, balanceFront, intensity, listening);
        this.updateSpine(breath, balanceSide, intensity, listening, backchannelNod);
        this.updateChest(breath, breathSecondary, intensity, listening, backchannelNod);
        this.updateShoulders(breath, breathSecondary, intensity, listening);
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

    private updateHips(
        basePosition: Vector3,
        sideWave: number,
        frontWave: number,
        intensity: number,
        listening: number,
    ): void {
        const bone = this.bones.get('hips');
        if (!bone) {
            return;
        }
        bone.node.position.set(
            basePosition.x + sideWave * CHARACTER_IDLE_MOTION_CONFIG.balance.hipsSideShift * intensity,
            basePosition.y,
            basePosition.z
                + frontWave * CHARACTER_IDLE_MOTION_CONFIG.balance.hipsFrontShift * intensity
                - listening * CHARACTER_IDLE_MOTION_CONFIG.listening.hipsFrontShift,
        );
        bone.node.rotation.set(
            bone.baseRotation.x,
            bone.baseRotation.y,
            bone.baseRotation.z + sideWave * CHARACTER_IDLE_MOTION_CONFIG.balance.hipsRollRad * intensity,
        );
    }

    private updateSpine(
        breathWave: number,
        sideWave: number,
        intensity: number,
        listening: number,
        backchannelNod: number,
    ): void {
        const bone = this.bones.get('spine');
        if (!bone) {
            return;
        }
        bone.node.rotation.set(
            bone.baseRotation.x
                - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.spinePitchRad * intensity
                - listening * CHARACTER_IDLE_MOTION_CONFIG.listening.spineLeanRad
                - backchannelNod * CHARACTER_IDLE_MOTION_CONFIG.listening.nodSpinePitchRad,
            bone.baseRotation.y + sideWave * CHARACTER_IDLE_MOTION_CONFIG.balance.spineYawRad * intensity,
            bone.baseRotation.z,
        );
    }

    private updateChest(
        breathWave: number,
        secondaryWave: number,
        intensity: number,
        listening: number,
        backchannelNod: number,
    ): void {
        const chest = this.bones.get('chest');
        if (chest) {
            chest.node.rotation.set(
                chest.baseRotation.x
                    - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.chestPitchRad * intensity
                    - listening * CHARACTER_IDLE_MOTION_CONFIG.listening.chestLeanRad
                    - backchannelNod * CHARACTER_IDLE_MOTION_CONFIG.listening.nodChestPitchRad,
                chest.baseRotation.y,
                chest.baseRotation.z + secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad * intensity,
            );
        }

        const upperChest = this.bones.get('upperChest');
        if (upperChest) {
            upperChest.node.rotation.set(
                upperChest.baseRotation.x
                    - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.upperChestPitchRad * intensity
                    - listening * CHARACTER_IDLE_MOTION_CONFIG.listening.upperChestLeanRad
                    - backchannelNod * CHARACTER_IDLE_MOTION_CONFIG.listening.nodChestPitchRad * 0.55,
                upperChest.baseRotation.y,
                upperChest.baseRotation.z - secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad * 0.65 * intensity,
            );
        }
    }

    private updateShoulders(breathWave: number, secondaryWave: number, intensity: number, listening: number): void {
        const shoulderQuieting = 1 - listening * 0.35;
        const left = this.bones.get('leftShoulder');
        if (left) {
            left.node.rotation.set(
                left.baseRotation.x,
                left.baseRotation.y,
                left.baseRotation.z - breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad * intensity * shoulderQuieting
                    + secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad * intensity * shoulderQuieting,
            );
        }

        const right = this.bones.get('rightShoulder');
        if (right) {
            right.node.rotation.set(
                right.baseRotation.x,
                right.baseRotation.y,
                right.baseRotation.z + breathWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad * intensity * shoulderQuieting
                    + secondaryWave * CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad * intensity * shoulderQuieting,
            );
        }
    }

    private updateListeningBlend(elapsedSeconds: number, snapshot: CharacterBehaviorSnapshot): number {
        const deltaSeconds = this.lastElapsedSeconds == null
            ? 1 / 60
            : MathUtils.clamp(elapsedSeconds - this.lastElapsedSeconds, 1 / 120, 0.1);
        this.lastElapsedSeconds = elapsedSeconds;
        const envelopeIntensity = this.vadEnvelopeIntensity(snapshot);
        let target = 0;
        if (snapshot.state === 'user_speaking') {
            target = 0.72 + envelopeIntensity * 0.28;
        } else if (snapshot.state === 'thinking') {
            target = 0.26;
        } else if (snapshot.state === 'attending') {
            target = 0.12;
        }
        const timeConstant = target > this.listeningBlend
            ? CHARACTER_IDLE_MOTION_CONFIG.listening.attackSeconds
            : CHARACTER_IDLE_MOTION_CONFIG.listening.releaseSeconds;
        const alpha = 1 - Math.exp(-deltaSeconds / timeConstant);
        this.listeningBlend += (target - this.listeningBlend) * alpha;
        return this.listeningBlend;
    }

    private vadEnvelopeIntensity(snapshot: CharacterBehaviorSnapshot): number {
        const rms = MathUtils.clamp(
            snapshot.vad.envelopeRms / CHARACTER_IDLE_MOTION_CONFIG.listening.envelopeRmsCeiling,
            0,
            1,
        );
        const peak = MathUtils.clamp(
            snapshot.vad.envelopePeak / CHARACTER_IDLE_MOTION_CONFIG.listening.envelopePeakCeiling,
            0,
            1,
        );
        return Math.max(rms, peak * 0.7);
    }

    private updateBackchannelNod(elapsedSeconds: number, snapshot: CharacterBehaviorSnapshot): number {
        const shouldStart = this.shouldStartBackchannelNod(snapshot);
        if (shouldStart) {
            this.nodStartedAtSeconds = elapsedSeconds;
            this.nodIntensity = MathUtils.clamp(snapshot.vad.lastSpeechDurationMs / 2400, 0.45, 1);
            this.lastBackchannelSpeechEndedAtMs = snapshot.vad.lastSpeechEndedAtMs;
            this.lastBackchannelTriggeredAtMs = snapshot.nowMs;
        }
        if (this.nodStartedAtSeconds == null) {
            return 0;
        }
        const progress = (elapsedSeconds - this.nodStartedAtSeconds)
            / CHARACTER_IDLE_MOTION_CONFIG.listening.nodDurationSeconds;
        if (progress >= 1) {
            this.nodStartedAtSeconds = null;
            return 0;
        }
        return Math.sin(Math.PI * MathUtils.clamp(progress, 0, 1)) * this.nodIntensity;
    }

    private shouldStartBackchannelNod(snapshot: CharacterBehaviorSnapshot): boolean {
        const speechEndedAtMs = snapshot.vad.lastSpeechEndedAtMs;
        if (
            snapshot.state !== 'thinking'
            || snapshot.aiSpeech.isSpeaking
            || speechEndedAtMs == null
            || speechEndedAtMs === this.lastBackchannelSpeechEndedAtMs
            || snapshot.vad.lastSpeechDurationMs < CHARACTER_IDLE_MOTION_CONFIG.listening.nodMinimumSpeechMs
        ) {
            return false;
        }
        if (
            this.lastBackchannelTriggeredAtMs != null
            && snapshot.nowMs - this.lastBackchannelTriggeredAtMs < CHARACTER_IDLE_MOTION_CONFIG.listening.nodCooldownMs
        ) {
            return false;
        }
        return snapshot.nowMs - speechEndedAtMs >= CHARACTER_IDLE_MOTION_CONFIG.listening.nodDelayMs;
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
