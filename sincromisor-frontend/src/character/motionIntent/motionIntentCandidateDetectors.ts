/**
 * 片腕単位の gesture / near-face / wave / fallback candidate を検出する heuristic 群。
 *
 * Gesture gate は ReliabilityMap がある場合、raw confidence ではなく `gesture.finalWeight` と hand / finger
 * reliability を使う。ReliabilityMap 欠損の legacy / unit-test 入力だけ Hand side confidence fallback を残す。
 * threshold を変える場合は gesture flicker と semantic fallback が増減するため、focused estimator tests と
 * motion-debug replay metrics を合わせて確認する。
 */
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { TemporalArmState } from "../temporal/temporalUpperBodyState";
import type {
    ArmSide,
    IntentCandidate,
    MotionIntentEstimatorInput,
    NormalizedEstimatorConfig,
    SideFrameContext,
    SideMemory,
    TimedArmIntent,
} from "./motionIntentEstimatorTypes";
import { calculateTorsoConfidence } from "./motionIntentGlobalDetectors";
import type { MotionIntentWarningCode } from "./motionIntentState";

export const GESTURE_INTENT_MAP: Record<string, TimedArmIntent | undefined> = {
    Open_Palm: "explain",
    Pointing_Up: "pointing",
    Thumb_Up: "thumbsUp",
    Victory: "peace",
    Closed_Fist: "guarded",
};

export function getReliabilityPart(
    reliability: ReliabilityMap | undefined,
    side: ArmSide,
    part: "Hand" | "Finger",
): number | undefined {
    if (reliability === undefined) {
        return undefined;
    }
    if (side === "left") {
        return part === "Hand"
            ? reliability.parts.leftHand.finalWeight
            : reliability.parts.leftFinger.finalWeight;
    }
    return part === "Hand"
        ? reliability.parts.rightHand.finalWeight
        : reliability.parts.rightFinger.finalWeight;
}

export function getSideReliability(ctx: SideFrameContext): number {
    const handReliability = getReliabilityPart(ctx.reliability, ctx.side, "Hand");
    if (handReliability !== undefined) {
        return handReliability;
    }
    return ctx.hand?.confidence ?? ctx.arm.confidence;
}

export function passesGestureGate(
    ctx: SideFrameContext,
    config: NormalizedEstimatorConfig,
): { ok: boolean; reliability: number; warnings: MotionIntentWarningCode[] } {
    const handConfidence = ctx.hand?.confidence ?? 0;
    const gestureReliability =
        ctx.reliability?.gesture.source === "gesture"
            ? ctx.reliability.gesture.finalWeight
            : undefined;
    const handReliability = getReliabilityPart(ctx.reliability, ctx.side, "Hand");
    const fingerReliability = getReliabilityPart(ctx.reliability, ctx.side, "Finger");
    const warnings: MotionIntentWarningCode[] = [];
    let ok = true;

    const gestureGateValue = gestureReliability ?? ctx.gesture?.confidence ?? 0;
    if (gestureGateValue < config.thresholds.gestureConfidence) {
        ok = false;
        warnings.push("gesture_unstable");
    }
    if (ctx.reliability === undefined && handConfidence < config.thresholds.handConfidence) {
        ok = false;
        warnings.push("low_hand_reliability");
    }
    if (handReliability !== undefined && handReliability < config.thresholds.handReliability) {
        ok = false;
        warnings.push("low_hand_reliability");
    }
    if (
        fingerReliability !== undefined &&
        fingerReliability < config.thresholds.fingerReliability
    ) {
        ok = false;
        warnings.push("low_hand_reliability");
    }

    return {
        ok,
        reliability:
            ctx.reliability === undefined
                ? Math.min(handConfidence, ctx.gesture?.confidence ?? 0)
                : Math.min(gestureReliability ?? 0, handReliability ?? 1, fingerReliability ?? 1),
        warnings,
    };
}

export function createMotionCandidate(
    ctx: SideFrameContext,
    memory: SideMemory,
    config: NormalizedEstimatorConfig,
): IntentCandidate | undefined {
    const gestureCandidate = createGestureCandidate(ctx, config);
    if (ctx.globalGuarded || ctx.arm.classification === "crossed") {
        return {
            intent: "guarded",
            confidence: Math.max(ctx.arm.confidence, gestureCandidate?.confidence ?? 0),
            reliability: getSideReliability(ctx),
            expressiveness: ctx.arm.forwardness,
            source: gestureCandidate?.source ?? "mixed",
            sourceGestureLabel: gestureCandidate?.sourceGestureLabel,
            warnings: ctx.sideSwapSuspect ? ["left_right_swap_suspect"] : [],
        };
    }
    if (ctx.globalClapLike) {
        return {
            intent: "clapLike",
            confidence: Math.min(ctx.arm.confidence, ctx.hand?.confidence ?? 1),
            reliability: getSideReliability(ctx),
            expressiveness: Math.abs(ctx.arm.velocity.wrist?.[0] ?? 0),
            source: "mixed",
            warnings: [],
        };
    }
    return (
        createWaveCandidate(ctx, memory, config) ??
        gestureCandidate ??
        createNearFaceCandidate(ctx, config)
    );
}

export function detectMotionFallbackCandidate(
    input: MotionIntentEstimatorInput,
    config: NormalizedEstimatorConfig,
): boolean {
    const torsoConfidence = calculateTorsoConfidence(input);
    const leftLow = isArmLostOrLow(input.temporal.arms.left, config.thresholds.fallbackConfidence);
    const rightLow = isArmLostOrLow(
        input.temporal.arms.right,
        config.thresholds.fallbackConfidence,
    );
    return leftLow && rightLow && torsoConfidence < config.thresholds.fallbackConfidence;
}

function createGestureCandidate(
    ctx: SideFrameContext,
    config: NormalizedEstimatorConfig,
): IntentCandidate | undefined {
    const mappedIntent = GESTURE_INTENT_MAP[ctx.gesture?.label ?? ""];
    if (mappedIntent === undefined) {
        return undefined;
    }
    const gate = passesGestureGate(ctx, config);
    if (!gate.ok) {
        return undefined;
    }
    return {
        intent: mappedIntent,
        confidence: ctx.gesture?.confidence ?? 0,
        reliability: gate.reliability,
        expressiveness: Math.max(ctx.arm.elevationRad, Math.abs(ctx.arm.velocity.wrist?.[0] ?? 0)),
        source: "gesture",
        sourceGestureLabel: ctx.gesture?.label,
        warnings: [],
    };
}

function createNearFaceCandidate(
    ctx: SideFrameContext,
    config: NormalizedEstimatorConfig,
): IntentCandidate | undefined {
    const handConfidence = ctx.hand?.confidence ?? 0;
    if (
        ctx.arm.classification !== "front" ||
        ctx.arm.elevationRad < config.thresholds.nearFaceElevationRad ||
        ctx.arm.forwardness < config.thresholds.nearFaceForwardness ||
        handConfidence < 0.45
    ) {
        return undefined;
    }
    return {
        intent: "nearFace",
        confidence: Math.min(ctx.arm.confidence, handConfidence),
        reliability: getSideReliability(ctx),
        expressiveness: Math.min(1, ctx.arm.elevationRad + ctx.arm.forwardness),
        source: "mixed",
        warnings: [],
    };
}

function createWaveCandidate(
    ctx: SideFrameContext,
    memory: SideMemory,
    config: NormalizedEstimatorConfig,
): IntentCandidate | undefined {
    if (ctx.gesture?.label !== "Open_Palm") {
        return undefined;
    }
    const gate = passesGestureGate(ctx, config);
    const alternations = updateWaveSamples(ctx, memory, config);
    if (
        !gate.ok ||
        ctx.arm.elevationRad < config.wave.minElevationRad ||
        memory.waveSigns.length === 0
    ) {
        return undefined;
    }
    return {
        intent: "wave",
        confidence: ctx.gesture.confidence,
        reliability: gate.reliability,
        expressiveness: Math.min(1, alternations / Math.max(1, config.wave.minAlternations)),
        ready: alternations >= config.wave.minAlternations,
        source: "mixed",
        sourceGestureLabel: ctx.gesture.label,
        warnings: alternations >= config.wave.minAlternations ? [] : ["wave_motion_missing"],
    };
}

function updateWaveSamples(
    ctx: SideFrameContext,
    memory: SideMemory,
    config: NormalizedEstimatorConfig,
): number {
    const velocityX = ctx.arm.velocity.wrist?.[0] ?? calculateImageVelocityX(ctx, memory);
    const threshold =
        ctx.arm.velocity.wrist === undefined
            ? config.wave.minImageVelocityX
            : config.wave.minBodyLocalVelocityX;
    if (ctx.invalidDt) {
        return 0;
    }
    if (Math.abs(velocityX) >= threshold) {
        const sign = velocityX < 0 ? -1 : 1;
        const last = memory.waveSigns[memory.waveSigns.length - 1];
        // Wave は左右往復だけを見たいので、同符号の連続 sample は交互回数へ数えない。
        if (last === undefined || last.sign !== sign) {
            memory.waveSigns.push({ mediaTimeMs: ctx.mediaTimeMs, sign });
        }
    }
    memory.waveSigns = memory.waveSigns.filter(
        (sample) => ctx.mediaTimeMs - sample.mediaTimeMs <= config.wave.windowMs,
    );
    return countAlternations(memory.waveSigns);
}

function calculateImageVelocityX(ctx: SideFrameContext, memory: SideMemory): number {
    if (
        ctx.hand?.fullFrameWrist === undefined ||
        memory.previousWrist === undefined ||
        ctx.validDtMs === undefined
    ) {
        return 0;
    }
    return ((ctx.hand.fullFrameWrist[0] - memory.previousWrist[0]) / ctx.validDtMs) * 1000;
}

function countAlternations(samples: readonly { sign: -1 | 1 }[]): number {
    let alternations = 0;
    for (let index = 1; index < samples.length; index += 1) {
        if (samples[index - 1]?.sign !== samples[index]?.sign) {
            alternations += 1;
        }
    }
    return alternations;
}

function isArmLostOrLow(arm: TemporalArmState, threshold: number): boolean {
    return arm.state === "lost" || arm.confidence < threshold;
}
