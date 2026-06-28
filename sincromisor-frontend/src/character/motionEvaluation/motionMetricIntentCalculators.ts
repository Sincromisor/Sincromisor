import type { ArmMotionIntent, MotionIntentSideState } from "../motionIntent/motionIntentState";
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import { parseIntent } from "./motionMetricFrameParsers";
import type { NumericMetricComputation } from "./motionMetricTypes";

// intent metrics は保存済み frame.intent だけを読む semantic intent group。
// missing intent の live 再推定、pose / temporal / solver の metric、summary 化はこの module では扱わない。
type ArmSide = "left" | "right";

const ARM_SIDES: ArmSide[] = ["left", "right"];

export function calculateIntentInvalidFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const intent = parseIntent(frame);
        if (intent.status === "missing") {
            continue;
        }
        sampleCount += 1;
        if (intent.status === "invalid") {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return { ok: false, reason: "intent_not_recorded", sampleCount };
    }
    return { ok: true, value: count, sampleCount };
}

export function calculateGestureFlickerCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    const previous: Partial<Record<ArmSide, MotionIntentSideState>> = {};
    for (const frame of frames) {
        const parsed = parseIntent(frame);
        if (parsed.status !== "valid") {
            continue;
        }
        for (const side of ARM_SIDES) {
            const current = parsed.intent.arms[side];
            const previousSide = previous[side];
            sampleCount += 1;
            if (
                previousSide !== undefined &&
                isSemanticIntent(previousSide.intent) &&
                previousSide.stableDurationMs < 150 &&
                (current.intent === "tracking" ||
                    (isSemanticIntent(current.intent) && current.intent !== previousSide.intent))
            ) {
                count += 1;
            }
            previous[side] = current;
        }
    }
    if (sampleCount === 0) {
        return { ok: false, reason: "intent_not_recorded", sampleCount };
    }
    return { ok: true, value: count, sampleCount };
}

export function calculateSemanticFallbackFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    return calculateIntentSideSampleCount(frames, (side) =>
        side.intent === "lost" || side.intent === "fallback" ? 1 : 0,
    );
}

export function calculateIntentCooldownSuppressionCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    return calculateIntentSideSampleCount(frames, (side) =>
        side.warnings.includes("gesture_cooldown") ? 1 : 0,
    );
}

function calculateIntentSideSampleCount(
    frames: readonly SincroMotionDebugFrame[],
    countForSide: (side: MotionIntentSideState) => number,
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const parsed = parseIntent(frame);
        if (parsed.status !== "valid") {
            continue;
        }
        for (const side of ARM_SIDES) {
            sampleCount += 1;
            count += countForSide(parsed.intent.arms[side]);
        }
    }
    if (sampleCount === 0) {
        return { ok: false, reason: "intent_not_recorded", sampleCount };
    }
    return { ok: true, value: count, sampleCount };
}

function isSemanticIntent(intent: ArmMotionIntent): boolean {
    return intent !== "tracking" && intent !== "lost" && intent !== "fallback";
}
