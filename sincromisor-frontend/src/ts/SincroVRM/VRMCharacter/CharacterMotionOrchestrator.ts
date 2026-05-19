import type { VRM } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { Vector3 } from "three/src/math/Vector3.js";
import type { CharacterBehaviorSnapshot } from "./CharacterBehaviorState";
import {
    CHARACTER_IDLE_MOTION_CONFIG,
    type CharacterMotionTuning,
    DEFAULT_CHARACTER_MOTION_TUNING,
    sineWave,
} from "./CharacterMotionConfig";
import {
    type CharacterMotionBone,
    captureOptionalMotionBones,
    type OptionalMotionBoneName,
} from "./characterMotionBones";
import { getAiSpeechExpressionMotionProfile } from "./characterMotionExpression";
import {
    applyChestMotion,
    applyShoulderMotion,
    applySpineMotion,
} from "./characterMotionTorsoApplier";
import type { SincroPoseRetargetFrame } from "./SincroPoseRetargeter";

// 呼吸、上半身の重心感、肩周りの小さな idle motion をまとめて適用する。
// hips はモデル全体の root として振る舞うVRMがあるため、位置揺れの対象にしない。
export class CharacterMotionOrchestrator {
    private readonly bones: Map<OptionalMotionBoneName, CharacterMotionBone>;
    private listeningBlend = 0;
    private lastElapsedSeconds: number | undefined;
    private lastBackchannelSpeechEndedAtMs: number | undefined;
    private lastBackchannelTriggeredAtMs: number | undefined;
    private nodStartedAtSeconds: number | undefined;
    private nodIntensity = 0;
    private aiSpeakingBlend = 0;
    private lastAiSpeakingElapsedSeconds: number | undefined;
    private lastAiSpeechBeatId = 0;
    private aiSpeechBeatStartedAtSeconds: number | undefined;
    private aiSpeechBeatIntensity = 0;
    private aiSpeechBeatDirection = 1;
    private tuning: CharacterMotionTuning = DEFAULT_CHARACTER_MOTION_TUNING;

    constructor(vrm: VRM) {
        this.bones = captureOptionalMotionBones(vrm);
    }

    update(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
        hipsBasePosition: Vector3,
        pose?: SincroPoseRetargetFrame,
    ): void {
        const motion = this.createMotionFrame(elapsedSeconds, snapshot);
        const expression = getAiSpeechExpressionMotionProfile(snapshot.aiSpeech.expressionCode);
        const motionScale = this.tuning.motionScale * snapshot.motionPolicy.idleMotionScale;

        this.stabilizeHips(hipsBasePosition);
        applySpineMotion(this.bones.get("spine"), {
            breathWave: motion.breath,
            sideWave: motion.balanceSide,
            intensity: motion.intensity,
            listening: motion.listening,
            backchannelNod: motion.backchannelNod,
            aiSpeaking: motion.aiSpeaking,
            aiGesture: motion.aiGesture,
            aiSpeechBeatDirection: this.aiSpeechBeatDirection,
            expression,
            motionScale,
            pose,
        });
        applyChestMotion(this.bones.get("chest"), this.bones.get("upperChest"), {
            breathWave: motion.breath,
            secondaryWave: motion.breathSecondary,
            intensity: motion.intensity,
            listening: motion.listening,
            backchannelNod: motion.backchannelNod,
            aiSpeaking: motion.aiSpeaking,
            aiGesture: motion.aiGesture,
            expression,
            motionScale,
            pose,
        });
        applyShoulderMotion(this.bones.get("leftShoulder"), this.bones.get("rightShoulder"), {
            breathWave: motion.breath,
            secondaryWave: motion.breathSecondary,
            intensity: motion.intensity,
            listening: motion.listening,
            aiSpeaking: motion.aiSpeaking,
            aiGesture: motion.aiGesture,
            expression,
            motionScale,
            pose,
        });
    }

    private createMotionFrame(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
    ): {
        breath: number;
        breathSecondary: number;
        balanceSide: number;
        intensity: number;
        listening: number;
        backchannelNod: number;
        aiSpeaking: number;
        aiGesture: number;
    } {
        return {
            breath: sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.breath.periodSeconds),
            breathSecondary: sineWave(
                elapsedSeconds,
                CHARACTER_IDLE_MOTION_CONFIG.breath.periodSeconds,
                Math.PI / 2,
            ),
            balanceSide: sineWave(
                elapsedSeconds,
                CHARACTER_IDLE_MOTION_CONFIG.balance.sidePeriodSeconds,
                Math.PI / 7,
            ),
            intensity: this.intensityForState(snapshot),
            listening: this.updateListeningBlend(elapsedSeconds, snapshot),
            backchannelNod: this.updateBackchannelNod(elapsedSeconds, snapshot),
            aiSpeaking: this.updateAiSpeakingBlend(elapsedSeconds, snapshot),
            aiGesture: this.updateAiSpeechBeat(elapsedSeconds, snapshot),
        };
    }

    setTuning(partial: Partial<CharacterMotionTuning>): void {
        this.tuning = {
            ...this.tuning,
            ...partial,
        };
    }

    private stabilizeHips(basePosition: Vector3): void {
        const bone = this.bones.get("hips");
        if (!bone) {
            return;
        }
        bone.node.position.copy(basePosition);
        bone.node.rotation.copy(bone.baseRotation);
    }

    private updateListeningBlend(
        elapsedSeconds: number,
        snapshot: CharacterBehaviorSnapshot,
    ): number {
        const deltaSeconds =
            this.lastElapsedSeconds === undefined
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
        if (this.nodStartedAtSeconds === undefined) {
            return 0;
        }
        const progress =
            (elapsedSeconds - this.nodStartedAtSeconds) /
            CHARACTER_IDLE_MOTION_CONFIG.listening.nodDurationSeconds;
        if (progress >= 1) {
            this.nodStartedAtSeconds = undefined;
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
            this.lastAiSpeakingElapsedSeconds === undefined
                ? 1 / 60
                : MathUtils.clamp(elapsedSeconds - this.lastAiSpeakingElapsedSeconds, 1 / 120, 0.1);
        this.lastAiSpeakingElapsedSeconds = elapsedSeconds;
        const expression = getAiSpeechExpressionMotionProfile(snapshot.aiSpeech.expressionCode);
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
            const expression = getAiSpeechExpressionMotionProfile(snapshot.aiSpeech.expressionCode);
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
        if (this.aiSpeechBeatStartedAtSeconds === undefined) {
            return 0;
        }
        const progress =
            (elapsedSeconds - this.aiSpeechBeatStartedAtSeconds) /
            CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.beatDurationSeconds;
        if (progress >= 1 || !snapshot.aiSpeech.isSpeaking) {
            this.aiSpeechBeatStartedAtSeconds = undefined;
            return 0;
        }
        return Math.sin(Math.PI * MathUtils.clamp(progress, 0, 1)) * this.aiSpeechBeatIntensity;
    }
}
