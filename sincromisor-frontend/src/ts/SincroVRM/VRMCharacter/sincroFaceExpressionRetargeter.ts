import { MathUtils } from "three/src/math/MathUtils.js";
import { clamp01 } from "./sincroFaceRetargetMath";
import {
    DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
    type SincroFaceRetargetConfig,
    type SincroFaceRetargetedExpressions,
} from "./sincroFaceRetargetTypes";

const MOUTH_OPEN_KEYS = ["jawOpen", "mouthOpen"] as const;
const MOUTH_CLOSE_KEYS = ["mouthClose"] as const;
const MOUTH_FUNNEL_KEYS = ["mouthFunnel"] as const;
const MOUTH_PUCKER_KEYS = ["mouthPucker"] as const;
const MOUTH_SMILE_LEFT_KEYS = ["mouthSmileLeft"] as const;
const MOUTH_SMILE_RIGHT_KEYS = ["mouthSmileRight"] as const;
const EYE_BLINK_LEFT_KEYS = ["eyeBlinkLeft"] as const;
const EYE_BLINK_RIGHT_KEYS = ["eyeBlinkRight"] as const;
const EYE_LOOK_LEFT_KEYS = ["eyeLookOutLeft", "eyeLookInRight"] as const;
const EYE_LOOK_RIGHT_KEYS = ["eyeLookInLeft", "eyeLookOutRight"] as const;
const EYE_LOOK_UP_KEYS = ["eyeLookUpLeft", "eyeLookUpRight"] as const;
const EYE_LOOK_DOWN_KEYS = ["eyeLookDownLeft", "eyeLookDownRight"] as const;

type SincroFaceExpressionRetargetConfig = Pick<
    SincroFaceRetargetConfig,
    "expressionDeadband" | "blinkCalibration"
>;

export function retargetSincroFaceExpressions(
    blendshapes: Record<string, number>,
    config: SincroFaceExpressionRetargetConfig = DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
): SincroFaceRetargetedExpressions {
    const blinkLeft = calibrateBlink(
        maxBlendshape(blendshapes, EYE_BLINK_LEFT_KEYS),
        config.blinkCalibration,
    );
    const blinkRight = calibrateBlink(
        maxBlendshape(blendshapes, EYE_BLINK_RIGHT_KEYS),
        config.blinkCalibration,
    );
    const mouthShape = retargetMouthShape(blendshapes);

    return {
        blink: Math.max(blinkLeft, blinkRight),
        blinkLeft,
        blinkRight,
        ...retargetEyeLookExpressions(blendshapes, config.expressionDeadband),
        ...retargetMouthExpressions(mouthShape, config.expressionDeadband),
    };
}

function retargetEyeLookExpressions(
    blendshapes: Record<string, number>,
    expressionDeadband: number,
): Pick<SincroFaceRetargetedExpressions, "lookLeft" | "lookRight" | "lookUp" | "lookDown"> {
    return {
        lookLeft: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_LEFT_KEYS),
            expressionDeadband,
        ),
        lookRight: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_RIGHT_KEYS),
            expressionDeadband,
        ),
        lookUp: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_UP_KEYS),
            expressionDeadband,
        ),
        lookDown: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_DOWN_KEYS),
            expressionDeadband,
        ),
    };
}

type SincroFaceMouthShape = {
    funnel: number;
    openness: number;
    rounded: number;
    spread: number;
};

function retargetMouthShape(blendshapes: Record<string, number>): SincroFaceMouthShape {
    const jawOpen = maxBlendshape(blendshapes, MOUTH_OPEN_KEYS);
    const mouthClose = maxBlendshape(blendshapes, MOUTH_CLOSE_KEYS);
    const funnel = maxBlendshape(blendshapes, MOUTH_FUNNEL_KEYS);
    const pucker = maxBlendshape(blendshapes, MOUTH_PUCKER_KEYS);
    const smile =
        (maxBlendshape(blendshapes, MOUTH_SMILE_LEFT_KEYS) +
            maxBlendshape(blendshapes, MOUTH_SMILE_RIGHT_KEYS)) /
        2;
    const openness = MathUtils.clamp(jawOpen * (1 - mouthClose * 0.72), 0, 1);
    const rounded = Math.max(funnel, pucker);

    return {
        funnel,
        openness,
        rounded,
        spread: smile * (1 - rounded * 0.5),
    };
}

function retargetMouthExpressions(
    mouthShape: SincroFaceMouthShape,
    expressionDeadband: number,
): Pick<SincroFaceRetargetedExpressions, "aa" | "ih" | "ou" | "ee" | "oh"> {
    const { funnel, openness, rounded, spread } = mouthShape;

    return {
        aa: applyExpressionDeadband(openness * (1 - rounded * 0.45), expressionDeadband),
        ih: applyExpressionDeadband(spread * 0.72 + openness * spread * 0.18, expressionDeadband),
        ou: applyExpressionDeadband(rounded * (0.35 + openness * 0.25), expressionDeadband),
        ee: applyExpressionDeadband(spread * 0.82, expressionDeadband),
        oh: applyExpressionDeadband(
            Math.max(funnel * 0.78, openness * rounded * 0.72),
            expressionDeadband,
        ),
    };
}

function maxBlendshape(blendshapes: Record<string, number>, keys: readonly string[]): number {
    let value = 0;
    for (const key of keys) {
        value = Math.max(value, clamp01(blendshapes[key] ?? 0));
    }
    return value;
}

function applyExpressionDeadband(value: number, deadband: number): number {
    const clamped = clamp01(value);
    if (clamped <= deadband) {
        return 0;
    }
    return MathUtils.clamp((clamped - deadband) / (1 - deadband), 0, 1);
}

function calibrateBlink(
    value: number,
    calibration: SincroFaceRetargetConfig["blinkCalibration"],
): number {
    const clamped = clamp01(value);
    if (clamped <= calibration.openThreshold) {
        return 0;
    }
    if (clamped >= calibration.closeThreshold) {
        return 1;
    }

    // MediaPipe の blink score は開眼時も閉眼時も端まで届きにくい。
    // しきい値間を smoothstep 化し、gamma で閉じ始めの反応を少し強める。
    const normalized =
        (clamped - calibration.openThreshold) /
        Math.max(0.001, calibration.closeThreshold - calibration.openThreshold);
    const eased = normalized * normalized * (3 - 2 * normalized);
    return MathUtils.clamp(eased ** calibration.gamma, 0, 1);
}
