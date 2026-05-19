import type { VRMExpressionPresetName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import type { Euler } from "three/src/math/Euler.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { CharacterInteractionState } from "./characterBehaviorState";

export type EyeBoneName = "leftEye" | "rightEye";

export type EyeBone = {
    node: Object3D;
    baseRotation: Euler;
};

export type EyeTarget = {
    x: number;
    y: number;
};

export const LOOK_PRESETS: VRMExpressionPresetName[] = [
    "lookLeft",
    "lookRight",
    "lookUp",
    "lookDown",
];

export const BLINK_PRESETS: VRMExpressionPresetName[] = ["blink", "blinkLeft", "blinkRight"];

export const EYE_BEHAVIOR_CONFIG = {
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

export const BLINK_INTERVAL_BY_STATE: Record<
    CharacterInteractionState,
    { minMs: number; maxMs: number }
> = {
    idle: { minMs: 3200, maxMs: 6800 },
    attending: { minMs: 3600, maxMs: 7200 },
    user_speaking: { minMs: 4200, maxMs: 7800 },
    thinking: { minMs: 1800, maxMs: 3600 },
    ai_speaking: { minMs: 2600, maxMs: 5200 },
    face_lost: { minMs: 2600, maxMs: 5600 },
    error_or_disconnected: { minMs: 2200, maxMs: 5000 },
};
