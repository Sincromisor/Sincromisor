import type { VRM, VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import type { Euler } from "three/src/math/Euler.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import type {
    CharacterBehaviorSnapshot,
    CharacterInteractionState,
} from "./CharacterBehaviorState";
import {
    type CharacterMotionTuning,
    DEFAULT_CHARACTER_MOTION_TUNING,
} from "./CharacterMotionConfig";
import type { SincroFaceRetargetFrame } from "./SincroFaceRetargeter";

type EyeBoneName = "leftEye" | "rightEye";

type EyeBone = {
    node: Object3D;
    baseRotation: Euler;
};

type EyeTarget = {
    x: number;
    y: number;
};

const LOOK_PRESETS: VRMExpressionPresetName[] = ["lookLeft", "lookRight", "lookUp", "lookDown"];
const BLINK_PRESETS: VRMExpressionPresetName[] = ["blink", "blinkLeft", "blinkRight"];

const EYE_BEHAVIOR_CONFIG = {
    maxHorizontalRad: MathUtils.degToRad(13),
    maxVerticalRad: MathUtils.degToRad(8),
    expressionHorizontalScale: 2.35,
    expressionVerticalScale: 2.8,
    microsaccadeAmplitude: 0.012,
    attentionMicrosaccadeAmplitude: 0.007,
    thinkingAversionOffsetX: -0.075,
    thinkingAversionOffsetY: 0.035,
    thinkingAversionDurationMs: 520,
    thinkingAversionMinIntervalMs: 1500,
    smoothingTimeConstantMs: 95,
    fallbackSmoothingTimeConstantMs: 240,
    blinkDurationMs: 170,
    blinkCloseRatio: 0.42,
    surprisedBlinkSuppressMs: 950,
} as const;

const BLINK_INTERVAL_BY_STATE: Record<CharacterInteractionState, { minMs: number; maxMs: number }> =
    {
        idle: { minMs: 3200, maxMs: 6800 },
        attending: { minMs: 3600, maxMs: 7200 },
        user_speaking: { minMs: 4200, maxMs: 7800 },
        thinking: { minMs: 1800, maxMs: 3600 },
        ai_speaking: { minMs: 2600, maxMs: 5200 },
        face_lost: { minMs: 2600, maxMs: 5600 },
        error_or_disconnected: { minMs: 2200, maxMs: 5000 },
    };

// 目線、まばたき、短い視線外しをまとめる controller。
// 標準look expressionを優先し、未実装モデルでは左右eyeボーンへフォールバックする。
export class EyeBehaviorController {
    private readonly expressionManager: VRMExpressionManager;
    private readonly eyeBones = new Map<EyeBoneName, EyeBone>();
    private readonly availableLookPresets = new Set<VRMExpressionPresetName>();
    private readonly availableBlinkPresets = new Set<VRMExpressionPresetName>();
    private smoothedTarget: EyeTarget = { x: 0.5, y: 0.5 };
    private microsaccade: EyeTarget = { x: 0, y: 0 };
    private nextMicrosaccadeAtMs = performance.now() + 900;
    private aversionTarget: EyeTarget | undefined;
    private aversionUntilMs = 0;
    private nextAversionAtMs = performance.now() + 900;
    private blinkStartedAtMs: number | undefined;
    private nextBlinkAtMs = performance.now() + this.randomRange(1800, 4200);
    private lastUpdateAtMs: number | undefined;
    private tuning: CharacterMotionTuning = DEFAULT_CHARACTER_MOTION_TUNING;

    constructor(vrm: VRM, expressionManager: VRMExpressionManager) {
        this.expressionManager = expressionManager;
        for (const preset of LOOK_PRESETS) {
            if (this.expressionManager.getExpression(preset) !== null) {
                this.availableLookPresets.add(preset);
            }
        }
        for (const preset of BLINK_PRESETS) {
            if (this.expressionManager.getExpression(preset) !== null) {
                this.availableBlinkPresets.add(preset);
            }
        }
        this.captureEyeBone(vrm, "leftEye");
        this.captureEyeBone(vrm, "rightEye");
    }

    update(snapshot: CharacterBehaviorSnapshot, sincroFace?: SincroFaceRetargetFrame): void {
        const nowMs = snapshot.nowMs;
        const deltaMs =
            this.lastUpdateAtMs === undefined
                ? 1000 / 60
                : MathUtils.clamp(nowMs - this.lastUpdateAtMs, 1, 100);
        this.lastUpdateAtMs = nowMs;
        if (
            snapshot.motionPolicy.allowFaceRetarget &&
            snapshot.faceMotion.trackingEnabled &&
            sincroFace
        ) {
            this.applySincroFaceMotion(sincroFace);
            return;
        }

        const target = this.nextEyeTarget(snapshot, nowMs);
        const timeConstantMs = snapshot.gaze.detected
            ? EYE_BEHAVIOR_CONFIG.smoothingTimeConstantMs
            : EYE_BEHAVIOR_CONFIG.fallbackSmoothingTimeConstantMs;
        const alpha = 1 - Math.exp(-deltaMs / timeConstantMs);
        this.smoothedTarget.x += (target.x - this.smoothedTarget.x) * alpha;
        this.smoothedTarget.y += (target.y - this.smoothedTarget.y) * alpha;

        const offsetX =
            MathUtils.clamp(this.smoothedTarget.x - 0.5, -0.5, 0.5) * this.tuning.eyeTrackingScale;
        const offsetY =
            MathUtils.clamp(this.smoothedTarget.y - 0.5, -0.5, 0.5) * this.tuning.eyeTrackingScale;
        this.applyLook(offsetX, offsetY);
        this.applyBlink(snapshot, nowMs);
    }

    setTuning(partial: Partial<CharacterMotionTuning>): void {
        this.tuning = {
            ...this.tuning,
            ...partial,
        };
    }

    private captureEyeBone(vrm: VRM, name: EyeBoneName): void {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (!node) {
            return;
        }
        this.eyeBones.set(name, {
            node,
            baseRotation: node.rotation.clone(),
        });
    }

    private nextEyeTarget(snapshot: CharacterBehaviorSnapshot, nowMs: number): EyeTarget {
        const baseTarget =
            snapshot.motionPolicy.allowGazeMotion && snapshot.gaze.detected
                ? { x: snapshot.gaze.targetX, y: snapshot.gaze.targetY }
                : { x: 0.5, y: 0.5 };
        const aversion = this.updateAversion(snapshot, nowMs);
        const microsaccade = this.updateMicrosaccade(snapshot, nowMs);
        const aiSpeechOffset = this.aiSpeechEyeOffset(snapshot);
        return {
            x: MathUtils.clamp(
                baseTarget.x + aversion.x + microsaccade.x + aiSpeechOffset.x,
                0.34,
                0.66,
            ),
            y: MathUtils.clamp(
                baseTarget.y + aversion.y + microsaccade.y + aiSpeechOffset.y,
                0.38,
                0.62,
            ),
        };
    }

    private aiSpeechEyeOffset(snapshot: CharacterBehaviorSnapshot): EyeTarget {
        if (!snapshot.motionPolicy.allowAiSpeechGesture || !snapshot.aiSpeech.isSpeaking) {
            return { x: 0, y: 0 };
        }
        switch (snapshot.aiSpeech.expressionCode) {
            case 2:
                return { x: -0.012, y: 0.018 };
            case 3:
                return { x: 0, y: -0.006 };
            case 4:
                return { x: 0.01, y: -0.012 };
            case 5:
                return { x: 0, y: -0.02 };
            case 1:
                return { x: 0.008, y: -0.004 };
            default:
                return { x: 0, y: -0.004 };
        }
    }

    private updateAversion(snapshot: CharacterBehaviorSnapshot, nowMs: number): EyeTarget {
        if (
            !snapshot.motionPolicy.allowThinkingAversion ||
            snapshot.state !== "thinking" ||
            !snapshot.gaze.detected
        ) {
            this.aversionTarget = undefined;
            return { x: 0, y: 0 };
        }
        if (this.aversionTarget && nowMs <= this.aversionUntilMs) {
            return this.aversionTarget;
        }
        if (nowMs < this.nextAversionAtMs) {
            this.aversionTarget = undefined;
            return { x: 0, y: 0 };
        }
        const direction = Math.random() < 0.5 ? -1 : 1;
        this.aversionTarget = {
            x: EYE_BEHAVIOR_CONFIG.thinkingAversionOffsetX * direction,
            y: EYE_BEHAVIOR_CONFIG.thinkingAversionOffsetY * (Math.random() < 0.65 ? 1 : -0.65),
        };
        this.aversionUntilMs = nowMs + EYE_BEHAVIOR_CONFIG.thinkingAversionDurationMs;
        this.nextAversionAtMs =
            nowMs + EYE_BEHAVIOR_CONFIG.thinkingAversionMinIntervalMs + this.randomRange(0, 850);
        return this.aversionTarget;
    }

    private updateMicrosaccade(snapshot: CharacterBehaviorSnapshot, nowMs: number): EyeTarget {
        if (nowMs < this.nextMicrosaccadeAtMs) {
            return this.microsaccade;
        }
        const stateIntervalScale = snapshot.state === "user_speaking" ? 1.45 : 1;
        const amplitude =
            snapshot.state === "user_speaking" || snapshot.state === "attending"
                ? EYE_BEHAVIOR_CONFIG.attentionMicrosaccadeAmplitude
                : EYE_BEHAVIOR_CONFIG.microsaccadeAmplitude;
        this.microsaccade = {
            x: this.randomRange(-amplitude, amplitude),
            y: this.randomRange(-amplitude * 0.65, amplitude * 0.65),
        };
        this.nextMicrosaccadeAtMs = nowMs + this.randomRange(720, 1800) * stateIntervalScale;
        return this.microsaccade;
    }

    private applyLook(offsetX: number, offsetY: number): void {
        const hasHorizontalLookExpression =
            this.availableLookPresets.has("lookLeft") || this.availableLookPresets.has("lookRight");
        const hasVerticalLookExpression =
            this.availableLookPresets.has("lookUp") || this.availableLookPresets.has("lookDown");
        if (hasHorizontalLookExpression || hasVerticalLookExpression) {
            this.applyLookExpressions(
                hasHorizontalLookExpression ? offsetX : 0,
                hasVerticalLookExpression ? offsetY : 0,
            );
        }
        if (!hasHorizontalLookExpression || !hasVerticalLookExpression) {
            this.applyEyeBoneRotation(
                hasHorizontalLookExpression ? 0 : offsetX,
                hasVerticalLookExpression ? 0 : offsetY,
            );
        }
    }

    private applyLookExpressions(offsetX: number, offsetY: number): void {
        for (const preset of LOOK_PRESETS) {
            this.setExpressionIfAvailable(preset, 0);
        }
        this.setExpressionIfAvailable(
            "lookLeft",
            MathUtils.clamp(-offsetX * EYE_BEHAVIOR_CONFIG.expressionHorizontalScale, 0, 1),
        );
        this.setExpressionIfAvailable(
            "lookRight",
            MathUtils.clamp(offsetX * EYE_BEHAVIOR_CONFIG.expressionHorizontalScale, 0, 1),
        );
        this.setExpressionIfAvailable(
            "lookUp",
            MathUtils.clamp(offsetY * EYE_BEHAVIOR_CONFIG.expressionVerticalScale, 0, 1),
        );
        this.setExpressionIfAvailable(
            "lookDown",
            MathUtils.clamp(-offsetY * EYE_BEHAVIOR_CONFIG.expressionVerticalScale, 0, 1),
        );
    }

    private applyEyeBoneRotation(offsetX: number, offsetY: number): void {
        for (const bone of this.eyeBones.values()) {
            bone.node.rotation.set(
                bone.baseRotation.x + offsetY * EYE_BEHAVIOR_CONFIG.maxVerticalRad * 2,
                bone.baseRotation.y - offsetX * EYE_BEHAVIOR_CONFIG.maxHorizontalRad * 2,
                bone.baseRotation.z,
            );
        }
    }

    private applySincroFaceMotion(sincroFace: SincroFaceRetargetFrame): void {
        const expressions = sincroFace.expressions;
        for (const preset of LOOK_PRESETS) {
            this.setExpressionIfAvailable(preset, 0);
        }
        this.setExpressionIfAvailable("lookLeft", expressions.lookLeft);
        this.setExpressionIfAvailable("lookRight", expressions.lookRight);
        this.setExpressionIfAvailable("lookUp", expressions.lookUp);
        this.setExpressionIfAvailable("lookDown", expressions.lookDown);
        this.applyBlinkExpressions(expressions.blinkLeft, expressions.blinkRight);

        const offsetX = MathUtils.clamp(
            (expressions.lookRight - expressions.lookLeft) * 0.42,
            -0.5,
            0.5,
        );
        const offsetY = MathUtils.clamp(
            (expressions.lookUp - expressions.lookDown) * 0.36,
            -0.5,
            0.5,
        );
        const lookExpressionCoversHorizontal =
            this.availableLookPresets.has("lookLeft") || this.availableLookPresets.has("lookRight");
        const lookExpressionCoversVertical =
            this.availableLookPresets.has("lookUp") || this.availableLookPresets.has("lookDown");
        this.applySincroEyeBoneFallback(
            lookExpressionCoversHorizontal ? 0 : offsetX,
            lookExpressionCoversVertical ? 0 : offsetY,
            this.availableBlinkPresets.size > 0 ? 0 : expressions.blinkLeft,
            this.availableBlinkPresets.size > 0 ? 0 : expressions.blinkRight,
        );
    }

    private applySincroEyeBoneFallback(
        offsetX: number,
        offsetY: number,
        blinkLeft: number,
        blinkRight: number,
    ): void {
        for (const [name, bone] of this.eyeBones) {
            const blink = name === "leftEye" ? blinkLeft : blinkRight;
            bone.node.rotation.set(
                bone.baseRotation.x +
                    offsetY * EYE_BEHAVIOR_CONFIG.maxVerticalRad * 2 +
                    blink * MathUtils.degToRad(9),
                bone.baseRotation.y - offsetX * EYE_BEHAVIOR_CONFIG.maxHorizontalRad * 2,
                bone.baseRotation.z,
            );
        }
    }

    private applyBlink(snapshot: CharacterBehaviorSnapshot, nowMs: number): void {
        if (this.availableBlinkPresets.size === 0) {
            return;
        }
        if (this.isBlinkSuppressed(snapshot, nowMs)) {
            this.applyBlinkExpressions(0, 0);
            this.blinkStartedAtMs = undefined;
            this.nextBlinkAtMs = Math.max(this.nextBlinkAtMs, nowMs + 450);
            return;
        }
        if (this.blinkStartedAtMs === undefined && nowMs >= this.nextBlinkAtMs) {
            this.blinkStartedAtMs = nowMs;
        }
        if (this.blinkStartedAtMs === undefined) {
            this.applyBlinkExpressions(0, 0);
            return;
        }

        const elapsedMs = nowMs - this.blinkStartedAtMs;
        const durationMs = EYE_BEHAVIOR_CONFIG.blinkDurationMs;
        if (elapsedMs >= durationMs) {
            this.applyBlinkExpressions(0, 0);
            this.blinkStartedAtMs = undefined;
            this.nextBlinkAtMs = nowMs + this.nextBlinkDelayMs(snapshot.state);
            return;
        }
        const closeMs = durationMs * EYE_BEHAVIOR_CONFIG.blinkCloseRatio;
        const value =
            elapsedMs < closeMs
                ? elapsedMs / closeMs
                : 1 - (elapsedMs - closeMs) / (durationMs - closeMs);
        this.applyBlinkExpressions(value, value);
    }

    private applyBlinkExpressions(left: number, right: number): void {
        const leftValue = MathUtils.clamp(left, 0, 1);
        const rightValue = MathUtils.clamp(right, 0, 1);
        const hasSeparateBlink =
            this.availableBlinkPresets.has("blinkLeft") ||
            this.availableBlinkPresets.has("blinkRight");

        // VRM 1.0 は `blink` を両目、`blinkLeft`/`blinkRight` を片目として定義する。
        // 片目 preset があるモデルでは左右を保持し、無いモデルだけ `blink` に畳み込む。
        if (hasSeparateBlink) {
            this.setBlinkExpressionIfAvailable("blink", 0);
            this.setBlinkExpressionIfAvailable("blinkLeft", leftValue);
            this.setBlinkExpressionIfAvailable("blinkRight", rightValue);
            return;
        }
        this.setBlinkExpressionIfAvailable("blink", Math.max(leftValue, rightValue));
    }

    private setBlinkExpressionIfAvailable(preset: VRMExpressionPresetName, value: number): void {
        if (!this.availableBlinkPresets.has(preset)) {
            return;
        }
        this.expressionManager.setValue(preset, MathUtils.clamp(value, 0, 1));
    }

    private isBlinkSuppressed(snapshot: CharacterBehaviorSnapshot, nowMs: number): boolean {
        return (
            snapshot.aiSpeech.expressionCode === 5 &&
            snapshot.aiSpeech.lastUpdatedAtMs !== undefined &&
            nowMs - snapshot.aiSpeech.lastUpdatedAtMs <=
                EYE_BEHAVIOR_CONFIG.surprisedBlinkSuppressMs
        );
    }

    private nextBlinkDelayMs(state: CharacterInteractionState): number {
        const range = BLINK_INTERVAL_BY_STATE[state];
        return this.randomRange(range.minMs, range.maxMs);
    }

    private setExpressionIfAvailable(preset: VRMExpressionPresetName, value: number): void {
        if (!this.availableLookPresets.has(preset)) {
            return;
        }
        this.expressionManager.setValue(preset, value);
    }

    private randomRange(min: number, max: number): number {
        return min + (max - min) * Math.random();
    }
}
