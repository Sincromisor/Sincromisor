import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import type { Euler } from "three/src/math/Euler.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { Vector3 } from "three/src/math/Vector3.js";
import type { CharacterBehaviorSnapshot } from "./CharacterBehaviorState";
import {
    CHARACTER_IDLE_MOTION_CONFIG,
    type CharacterMotionTuning,
    DEFAULT_CHARACTER_MOTION_TUNING,
    sineWave,
} from "./CharacterMotionConfig";
import type { SincroPoseRetargetFrame } from "./SincroPoseRetargeter";

type OptionalBoneName =
    | "hips"
    | "spine"
    | "chest"
    | "upperChest"
    | "leftShoulder"
    | "rightShoulder";

type MotionBone = {
    node: Object3D;
    baseRotation: Euler;
};

// 呼吸、上半身の重心感、肩周りの小さな idle motion をまとめて適用する。
// hips はモデル全体の root として振る舞うVRMがあるため、位置揺れの対象にしない。
export class CharacterMotionOrchestrator {
    private readonly bones = new Map<OptionalBoneName, MotionBone>();
    private listeningBlend = 0;
    private lastElapsedSeconds: number | null = null;
    private lastBackchannelSpeechEndedAtMs: number | undefined;
    private lastBackchannelTriggeredAtMs: number | undefined;
    private nodStartedAtSeconds: number | null = null;
    private nodIntensity = 0;
    private aiSpeakingBlend = 0;
    private lastAiSpeakingElapsedSeconds: number | null = null;
    private lastAiSpeechBeatId = 0;
    private aiSpeechBeatStartedAtSeconds: number | null = null;
    private aiSpeechBeatIntensity = 0;
    private aiSpeechBeatDirection = 1;
    private tuning: CharacterMotionTuning = DEFAULT_CHARACTER_MOTION_TUNING;

    constructor(vrm: VRM) {
        this.captureOptionalBone(vrm, "hips");
        this.captureOptionalBone(vrm, "spine");
        this.captureOptionalBone(vrm, "chest");
        this.captureOptionalBone(vrm, "upperChest");
        this.captureOptionalBone(vrm, "leftShoulder");
        this.captureOptionalBone(vrm, "rightShoulder");
    }

    update(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
        hipsBasePosition: Vector3,
        pose?: SincroPoseRetargetFrame,
    ): void {
        const breath = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.breath.periodSeconds);
        const breathSecondary = sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.breath.periodSeconds,
            Math.PI / 2,
        );
        const balanceSide = sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.balance.sidePeriodSeconds,
            Math.PI / 7,
        );
        const intensity = this.intensityForState(snapshot);
        const listening = this.updateListeningBlend(elapsedSeconds, snapshot);
        const backchannelNod = this.updateBackchannelNod(elapsedSeconds, snapshot);
        const aiSpeaking = this.updateAiSpeakingBlend(elapsedSeconds, snapshot);
        const aiGesture = this.updateAiSpeechBeat(elapsedSeconds, snapshot);
        const expression = this.aiSpeechExpressionProfile(snapshot.aiSpeech.expressionCode);
        const motionScale = this.tuning.motionScale * snapshot.motionPolicy.idleMotionScale;

        this.stabilizeHips(hipsBasePosition);
        this.updateSpine(
            breath,
            balanceSide,
            intensity,
            listening,
            backchannelNod,
            aiSpeaking,
            aiGesture,
            expression,
            motionScale,
            pose,
        );
        this.updateChest(
            breath,
            breathSecondary,
            intensity,
            listening,
            backchannelNod,
            aiSpeaking,
            aiGesture,
            expression,
            motionScale,
            pose,
        );
        this.updateShoulders(
            breath,
            breathSecondary,
            intensity,
            listening,
            aiSpeaking,
            aiGesture,
            expression,
            motionScale,
            pose,
        );
    }

    setTuning(partial: Partial<CharacterMotionTuning>): void {
        this.tuning = {
            ...this.tuning,
            ...partial,
        };
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

    private stabilizeHips(basePosition: Vector3): void {
        const bone = this.bones.get("hips");
        if (!bone) {
            return;
        }
        bone.node.position.copy(basePosition);
        bone.node.rotation.copy(bone.baseRotation);
    }

    private updateSpine(
        breathWave: number,
        sideWave: number,
        intensity: number,
        listening: number,
        backchannelNod: number,
        aiSpeaking: number,
        aiGesture: number,
        expression: AiSpeechExpressionMotionProfile,
        motionScale: number,
        pose?: SincroPoseRetargetFrame,
    ): void {
        const bone = this.bones.get("spine");
        if (!bone) {
            return;
        }
        bone.node.rotation.set(
            bone.baseRotation.x -
                breathWave *
                    CHARACTER_IDLE_MOTION_CONFIG.breath.spinePitchRad *
                    intensity *
                    motionScale -
                listening * CHARACTER_IDLE_MOTION_CONFIG.listening.spineLeanRad * motionScale -
                backchannelNod *
                    CHARACTER_IDLE_MOTION_CONFIG.listening.nodSpinePitchRad *
                    motionScale +
                aiSpeaking * expression.spinePitchRad * motionScale,
            bone.baseRotation.y +
                sideWave *
                    CHARACTER_IDLE_MOTION_CONFIG.balance.spineYawRad *
                    intensity *
                    motionScale +
                aiGesture *
                    this.aiSpeechBeatDirection *
                    CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineBeatYawRad *
                    motionScale +
                (pose?.upperBody.spine.y ?? 0),
            bone.baseRotation.z + (pose?.upperBody.spine.z ?? 0),
        );
    }

    private updateChest(
        breathWave: number,
        secondaryWave: number,
        intensity: number,
        listening: number,
        backchannelNod: number,
        aiSpeaking: number,
        aiGesture: number,
        expression: AiSpeechExpressionMotionProfile,
        motionScale: number,
        pose?: SincroPoseRetargetFrame,
    ): void {
        const chest = this.bones.get("chest");
        if (chest) {
            chest.node.rotation.set(
                chest.baseRotation.x -
                    breathWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.chestPitchRad *
                        intensity *
                        motionScale -
                    listening * CHARACTER_IDLE_MOTION_CONFIG.listening.chestLeanRad * motionScale -
                    backchannelNod *
                        CHARACTER_IDLE_MOTION_CONFIG.listening.nodChestPitchRad *
                        motionScale +
                    aiSpeaking * expression.chestPitchRad * motionScale -
                    aiGesture *
                        CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestBeatPitchRad *
                        motionScale,
                chest.baseRotation.y + (pose?.upperBody.chest.y ?? 0),
                chest.baseRotation.z +
                    secondaryWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad *
                        intensity *
                        motionScale +
                    (pose?.upperBody.chest.z ?? 0),
            );
        }

        const upperChest = this.bones.get("upperChest");
        if (upperChest) {
            upperChest.node.rotation.set(
                upperChest.baseRotation.x -
                    breathWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.upperChestPitchRad *
                        intensity *
                        motionScale -
                    listening *
                        CHARACTER_IDLE_MOTION_CONFIG.listening.upperChestLeanRad *
                        motionScale -
                    backchannelNod *
                        CHARACTER_IDLE_MOTION_CONFIG.listening.nodChestPitchRad *
                        0.55 *
                        motionScale +
                    aiSpeaking * expression.upperChestPitchRad * motionScale -
                    aiGesture *
                        CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestBeatPitchRad *
                        0.65 *
                        motionScale,
                upperChest.baseRotation.y,
                upperChest.baseRotation.z -
                    secondaryWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad *
                        0.65 *
                        intensity *
                        motionScale +
                    aiSpeaking * expression.upperChestRollRad * motionScale +
                    (pose?.upperBody.chest.z ?? 0) * 0.45,
            );
        }
    }

    private updateShoulders(
        breathWave: number,
        secondaryWave: number,
        intensity: number,
        listening: number,
        aiSpeaking: number,
        aiGesture: number,
        expression: AiSpeechExpressionMotionProfile,
        motionScale: number,
        pose?: SincroPoseRetargetFrame,
    ): void {
        const shoulderQuieting = 1 - listening * 0.35;
        const speechQuieting = 1 - aiSpeaking * expression.idleQuieting;
        const left = this.bones.get("leftShoulder");
        if (left) {
            left.node.rotation.set(
                left.baseRotation.x,
                left.baseRotation.y,
                left.baseRotation.z -
                    breathWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad *
                        intensity *
                        shoulderQuieting *
                        motionScale +
                    secondaryWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad *
                        intensity *
                        shoulderQuieting *
                        speechQuieting *
                        motionScale -
                    aiSpeaking * expression.shoulderOpenRad * motionScale -
                    aiGesture *
                        CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderBeatRad *
                        motionScale +
                    (pose?.upperBody.leftShoulder.z ?? 0),
            );
        }

        const right = this.bones.get("rightShoulder");
        if (right) {
            right.node.rotation.set(
                right.baseRotation.x,
                right.baseRotation.y,
                right.baseRotation.z +
                    breathWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad *
                        intensity *
                        shoulderQuieting *
                        motionScale +
                    secondaryWave *
                        CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad *
                        intensity *
                        shoulderQuieting *
                        speechQuieting *
                        motionScale +
                    aiSpeaking * expression.shoulderOpenRad * motionScale +
                    aiGesture *
                        CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderBeatRad *
                        motionScale +
                    (pose?.upperBody.rightShoulder.z ?? 0),
            );
        }
    }

    private updateListeningBlend(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
    ): number {
        const deltaSeconds =
            this.lastElapsedSeconds == null
                ? 1 / 60
                : MathUtils.clamp(elapsedSeconds - this.lastElapsedSeconds, 1 / 120, 0.1);
        this.lastElapsedSeconds = elapsedSeconds;
        const envelopeIntensity = this.vadEnvelopeIntensity(snapshot);
        let target = 0;
        if (snapshot.motionPolicy.talkMode !== "chat") {
            target = 0;
        } else if (snapshot.state === "user_speaking") {
            target = 0.72 + envelopeIntensity * 0.28;
        } else if (snapshot.state === "thinking") {
            target = 0.26;
        } else if (snapshot.state === "attending") {
            target = 0.12;
        }
        const timeConstant =
            target > this.listeningBlend
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

    private updateBackchannelNod(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
    ): number {
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
        const progress =
            (elapsedSeconds - this.nodStartedAtSeconds) /
            CHARACTER_IDLE_MOTION_CONFIG.listening.nodDurationSeconds;
        if (progress >= 1) {
            this.nodStartedAtSeconds = null;
            return 0;
        }
        return Math.sin(Math.PI * MathUtils.clamp(progress, 0, 1)) * this.nodIntensity;
    }

    private shouldStartBackchannelNod(snapshot: CharacterBehaviorSnapshot): boolean {
        const speechEndedAtMs = snapshot.vad.lastSpeechEndedAtMs;
        if (
            !snapshot.motionPolicy.allowThinkingAversion ||
            !snapshot.motionPolicy.allowAiSpeechGesture ||
            snapshot.motionPolicy.neutralTransition ||
            snapshot.state !== "thinking" ||
            snapshot.aiSpeech.isSpeaking ||
            speechEndedAtMs === undefined ||
            speechEndedAtMs === this.lastBackchannelSpeechEndedAtMs ||
            snapshot.vad.lastSpeechDurationMs <
                CHARACTER_IDLE_MOTION_CONFIG.listening.nodMinimumSpeechMs
        ) {
            return false;
        }
        if (
            this.lastBackchannelTriggeredAtMs !== undefined &&
            snapshot.nowMs - this.lastBackchannelTriggeredAtMs <
                CHARACTER_IDLE_MOTION_CONFIG.listening.nodCooldownMs
        ) {
            return false;
        }
        return (
            snapshot.nowMs - speechEndedAtMs >= CHARACTER_IDLE_MOTION_CONFIG.listening.nodDelayMs
        );
    }

    private intensityForState(snapshot: CharacterBehaviorSnapshot): number {
        if (snapshot.state === "error_or_disconnected") {
            return 0.45;
        }
        if (snapshot.state === "ai_speaking" || snapshot.state === "user_speaking") {
            return 0.75;
        }
        return 1;
    }

    private updateAiSpeakingBlend(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
    ): number {
        const deltaSeconds =
            this.lastAiSpeakingElapsedSeconds == null
                ? 1 / 60
                : MathUtils.clamp(elapsedSeconds - this.lastAiSpeakingElapsedSeconds, 1 / 120, 0.1);
        this.lastAiSpeakingElapsedSeconds = elapsedSeconds;
        const expression = this.aiSpeechExpressionProfile(snapshot.aiSpeech.expressionCode);
        const target =
            snapshot.motionPolicy.allowAiSpeechGesture && snapshot.aiSpeech.isSpeaking
                ? expression.postureIntensity *
                  CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.postureBlendScale
                : 0;
        const timeConstant =
            target > this.aiSpeakingBlend
                ? CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.attackSeconds
                : CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.releaseSeconds;
        const alpha = 1 - Math.exp(-deltaSeconds / timeConstant);
        this.aiSpeakingBlend += (target - this.aiSpeakingBlend) * alpha;
        return this.aiSpeakingBlend;
    }

    private updateAiSpeechBeat(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
    ): number {
        if (
            snapshot.motionPolicy.allowAiSpeechGesture &&
            snapshot.aiSpeech.isSpeaking &&
            snapshot.aiSpeech.beatId !== this.lastAiSpeechBeatId &&
            snapshot.aiSpeech.beatIntensity > 0
        ) {
            this.lastAiSpeechBeatId = snapshot.aiSpeech.beatId;
            this.aiSpeechBeatStartedAtSeconds = elapsedSeconds;
            this.aiSpeechBeatDirection *= -1;
            const expression = this.aiSpeechExpressionProfile(snapshot.aiSpeech.expressionCode);
            const kindScale =
                snapshot.aiSpeech.beatKind === "speech_start"
                    ? 1.0
                    : snapshot.aiSpeech.beatKind === "punctuation"
                      ? 0.58
                      : 0.78;
            this.aiSpeechBeatIntensity = MathUtils.clamp(
                snapshot.aiSpeech.beatIntensity * expression.gestureIntensity * kindScale,
                0,
                1,
            );
        }
        if (this.aiSpeechBeatStartedAtSeconds == null) {
            return 0;
        }
        const progress =
            (elapsedSeconds - this.aiSpeechBeatStartedAtSeconds) /
            CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.beatDurationSeconds;
        if (progress >= 1 || !snapshot.aiSpeech.isSpeaking) {
            this.aiSpeechBeatStartedAtSeconds = null;
            return 0;
        }
        return Math.sin(Math.PI * MathUtils.clamp(progress, 0, 1)) * this.aiSpeechBeatIntensity;
    }

    private aiSpeechExpressionProfile(
        expressionCode: number | undefined,
    ): AiSpeechExpressionMotionProfile {
        switch (expressionCode) {
            case 2:
                return {
                    postureIntensity: 0.7,
                    gestureIntensity: 0.58,
                    idleQuieting: 0.34,
                    spinePitchRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad,
                    chestPitchRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestPitchRad,
                    upperChestPitchRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestPitchRad,
                    upperChestRollRad:
                        -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestRollRad * 0.35,
                    shoulderOpenRad:
                        -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.45,
                };
            case 3:
                return {
                    postureIntensity: 0.82,
                    gestureIntensity: 0.72,
                    idleQuieting: 0.55,
                    spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.25,
                    chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.55,
                    upperChestPitchRad:
                        -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.65,
                    upperChestRollRad: 0,
                    shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.35,
                };
            case 4:
                return {
                    postureIntensity: 0.86,
                    gestureIntensity: 0.82,
                    idleQuieting: 0.18,
                    spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.45,
                    chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad,
                    upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.9,
                    upperChestRollRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestRollRad,
                    shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad,
                };
            case 5:
                return {
                    postureIntensity: 0.9,
                    gestureIntensity: 0.9,
                    idleQuieting: 0.4,
                    spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.6,
                    chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.8,
                    upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad,
                    upperChestRollRad: 0,
                    shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.75,
                };
            case 1:
                return {
                    postureIntensity: 0.58,
                    gestureIntensity: 0.48,
                    idleQuieting: 0.2,
                    spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.2,
                    chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.35,
                    upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.3,
                    upperChestRollRad:
                        CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestRollRad * 0.35,
                    shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.4,
                };
            default:
                return {
                    postureIntensity: 0.54,
                    gestureIntensity: 0.5,
                    idleQuieting: 0.26,
                    spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.12,
                    chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.24,
                    upperChestPitchRad:
                        -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.18,
                    upperChestRollRad: 0,
                    shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.22,
                };
        }
    }
}

type AiSpeechExpressionMotionProfile = {
    postureIntensity: number;
    gestureIntensity: number;
    idleQuieting: number;
    spinePitchRad: number;
    chestPitchRad: number;
    upperChestPitchRad: number;
    upperChestRollRad: number;
    shoulderOpenRad: number;
};
