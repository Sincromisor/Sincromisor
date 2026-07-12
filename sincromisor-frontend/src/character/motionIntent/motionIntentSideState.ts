/**
 * MotionIntent side state と side memory を作る factory / helper 群。
 * warning dedupe と semantic hold は保存 contract の安定性を守るための処理で、candidate 検出や global 判定は別 module に残す。
 */
import type { TemporalArmState } from "../temporal/temporalUpperBodyState";
import { clamp01 } from "./motionIntentEstimatorConfig";
import type {
    IntentCandidate,
    NormalizedEstimatorConfig,
    SemanticArmIntent,
    SideMemory,
    TimedArmIntent,
} from "./motionIntentEstimatorTypes";
import type {
    ArmMotionIntent,
    MotionIntentSideState,
    MotionIntentWarningCode,
} from "./motionIntentState";

export function uniqueWarnings(
    warnings: readonly MotionIntentWarningCode[],
): MotionIntentWarningCode[] {
    return warnings.filter((warning, index) => warnings.indexOf(warning) === index);
}

export function createTrackingSideState(input: {
    arm: TemporalArmState;
    reliability: number;
    warnings: MotionIntentWarningCode[];
    cooldownRemainingMs?: number;
}): MotionIntentSideState {
    return {
        intent: "tracking",
        confidence: clamp01(input.arm.confidence),
        reliability: clamp01(input.reliability),
        expressiveness: clamp01(Math.abs(input.arm.velocity.wrist?.[0] ?? 0)),
        ageMs: input.arm.observedAgeMs,
        stableDurationMs: 0,
        cooldownRemainingMs: input.cooldownRemainingMs ?? 0,
        source: "temporal",
        warnings: uniqueWarnings(input.warnings),
    };
}

export function createIntentSideState(input: {
    candidate: IntentCandidate;
    arm: TemporalArmState;
    stableDurationMs: number;
    cooldownRemainingMs: number;
}): MotionIntentSideState {
    return {
        intent: input.candidate.intent,
        confidence: clamp01(input.candidate.confidence),
        reliability: clamp01(input.candidate.reliability),
        expressiveness: clamp01(input.candidate.expressiveness),
        ageMs: input.arm.observedAgeMs,
        stableDurationMs: input.stableDurationMs,
        cooldownRemainingMs: input.cooldownRemainingMs,
        source: input.candidate.source,
        sourceGestureLabel: input.candidate.sourceGestureLabel,
        warnings: uniqueWarnings(input.candidate.warnings),
    };
}

export function createLostSideState(
    arm: TemporalArmState,
    warnings: MotionIntentWarningCode[],
): MotionIntentSideState {
    return {
        intent: "lost",
        confidence: clamp01(arm.confidence),
        reliability: clamp01(arm.confidence),
        expressiveness: 0,
        ageMs: arm.observedAgeMs,
        stableDurationMs: 0,
        cooldownRemainingMs: 0,
        source: "fallback",
        warnings: uniqueWarnings(warnings),
    };
}

export function createFallbackSideState(input: {
    arm: TemporalArmState;
    stableDurationMs: number;
    warnings: MotionIntentWarningCode[];
}): MotionIntentSideState {
    return {
        intent: "fallback",
        confidence: 0,
        reliability: clamp01(input.arm.confidence),
        expressiveness: 0,
        ageMs: input.arm.observedAgeMs,
        stableDurationMs: input.stableDurationMs,
        cooldownRemainingMs: 0,
        source: "fallback",
        warnings: uniqueWarnings(["fallback_active", ...input.warnings]),
    };
}

export function createInitialMemory(): SideMemory {
    return {
        candidateStableDurationMs: 0,
        activeIntent: "tracking",
        cooldownUntilMs: {},
        waveSigns: [],
        lastState: {
            intent: "tracking",
            confidence: 0,
            reliability: 0,
            expressiveness: 0,
            ageMs: 0,
            stableDurationMs: 0,
            cooldownRemainingMs: 0,
            source: "fallback",
            warnings: [],
        },
    };
}

export function isSemanticIntent(intent: ArmMotionIntent): intent is SemanticArmIntent {
    return intent !== "tracking" && intent !== "lost" && intent !== "fallback";
}

export function getTiming(intent: TimedArmIntent | "wave", config: NormalizedEstimatorConfig) {
    if (intent === "wave") {
        return {
            minimumDurationMs: config.wave.minimumDurationMs,
            cooldownMs: config.wave.cooldownMs,
        };
    }
    return config.timing[intent];
}

export function semanticStateForHold(
    state: MotionIntentSideState,
): MotionIntentSideState | undefined {
    if (!isSemanticIntent(state.intent)) {
        return undefined;
    }
    return {
        ...state,
        warnings: [...state.warnings],
    };
}

export function cloneSideStateWithWarnings(
    state: MotionIntentSideState,
    warnings: readonly MotionIntentWarningCode[],
): MotionIntentSideState {
    return {
        ...state,
        warnings: uniqueWarnings([...state.warnings, ...warnings]),
    };
}
