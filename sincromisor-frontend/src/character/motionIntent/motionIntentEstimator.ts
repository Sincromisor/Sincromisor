import type {
    SincroHandMotionSnapshot,
    SincroHandSideSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { TemporalArmState, TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import {
    type ArmMotionIntent,
    MOTION_INTENT_SCHEMA_VERSION,
    type MotionIntentSideState,
    type MotionIntentState,
    type MotionIntentWarningCode,
} from "./motionIntentState";

export type GestureIntentObservation = {
    left?: { label: string; confidence: number };
    right?: { label: string; confidence: number };
};

export type MotionIntentEstimatorInput = {
    temporal: TemporalUpperBodyState;
    reliability?: ReliabilityMap;
    hand?: SincroHandMotionSnapshot;
    gesture?: GestureIntentObservation;
    mediaTimeMs: number;
};

export type IntentTimingConfig = {
    minimumDurationMs: number;
    cooldownMs: number;
};

export type MotionIntentEstimatorConfig = {
    timing?: Partial<
        Record<Exclude<ArmMotionIntent, "tracking" | "lost" | "wave">, Partial<IntentTimingConfig>>
    >;
    thresholds?: Partial<{
        gestureConfidence: number;
        handConfidence: number;
        handReliability: number;
        fingerReliability: number;
        fallbackConfidence: number;
        nearFaceElevationRad: number;
        nearFaceForwardness: number;
        clapDistance2d: number;
        guardedHandDistance2d: number;
    }>;
    wave?: Partial<{
        minimumDurationMs: number;
        cooldownMs: number;
        windowMs: number;
        minAlternations: number;
        minElevationRad: number;
        minBodyLocalVelocityX: number;
        minImageVelocityX: number;
    }>;
    predictedSemanticHoldMs?: number;
    sideSwapHoldMs?: number;
};

type ArmSide = "left" | "right";
type TimedArmIntent = Exclude<ArmMotionIntent, "tracking" | "lost" | "wave">;
type SemanticArmIntent = Exclude<ArmMotionIntent, "tracking" | "lost" | "fallback">;

type NormalizedEstimatorConfig = {
    timing: Record<TimedArmIntent, IntentTimingConfig>;
    thresholds: {
        gestureConfidence: number;
        handConfidence: number;
        handReliability: number;
        fingerReliability: number;
        fallbackConfidence: number;
        nearFaceElevationRad: number;
        nearFaceForwardness: number;
        clapDistance2d: number;
        guardedHandDistance2d: number;
    };
    wave: {
        minimumDurationMs: number;
        cooldownMs: number;
        windowMs: number;
        minAlternations: number;
        minElevationRad: number;
        minBodyLocalVelocityX: number;
        minImageVelocityX: number;
    };
    predictedSemanticHoldMs: number;
    sideSwapHoldMs: number;
};

type IntentCandidate = {
    intent: TimedArmIntent | "wave";
    source: MotionIntentSideState["source"];
    confidence: number;
    reliability: number;
    expressiveness: number;
    ready?: boolean;
    sourceGestureLabel?: string;
    warnings: MotionIntentWarningCode[];
};

type SideFrameContext = {
    side: ArmSide;
    arm: TemporalArmState;
    hand?: SincroHandSideSnapshot;
    gesture?: { label: string; confidence: number };
    reliability?: ReliabilityMap;
    mediaTimeMs: number;
    validDtMs?: number;
    invalidDt: boolean;
    globalGuarded: boolean;
    globalClapLike: boolean;
    sideSwapSuspect: boolean;
};

type SideMemory = {
    candidateIntent?: ArmMotionIntent;
    candidateStartedAtMs?: number;
    candidateStableDurationMs: number;
    activeIntent: ArmMotionIntent;
    semanticHoldStartedAtMs?: number;
    previousSemantic?: MotionIntentSideState;
    cooldownUntilMs: Partial<Record<SemanticArmIntent | "fallback", number>>;
    previousWrist?: readonly [number, number];
    waveSigns: { mediaTimeMs: number; sign: -1 | 1 }[];
    lastState: MotionIntentSideState;
};

const SIDES: readonly ArmSide[] = ["left", "right"];
const TIMED_INTENTS: readonly TimedArmIntent[] = [
    "pointing",
    "thumbsUp",
    "peace",
    "nearFace",
    "explain",
    "clapLike",
    "guarded",
    "fallback",
];

const DEFAULT_TIMING: Record<TimedArmIntent, IntentTimingConfig> = {
    pointing: { minimumDurationMs: 200, cooldownMs: 500 },
    thumbsUp: { minimumDurationMs: 200, cooldownMs: 500 },
    peace: { minimumDurationMs: 200, cooldownMs: 500 },
    nearFace: { minimumDurationMs: 250, cooldownMs: 300 },
    explain: { minimumDurationMs: 300, cooldownMs: 400 },
    clapLike: { minimumDurationMs: 150, cooldownMs: 800 },
    guarded: { minimumDurationMs: 250, cooldownMs: 500 },
    fallback: { minimumDurationMs: 300, cooldownMs: 0 },
};

const DEFAULT_CONFIG: NormalizedEstimatorConfig = {
    timing: DEFAULT_TIMING,
    thresholds: {
        gestureConfidence: 0.7,
        handConfidence: 0.6,
        handReliability: 0.6,
        fingerReliability: 0.45,
        fallbackConfidence: 0.15,
        nearFaceElevationRad: 0.2,
        nearFaceForwardness: 0.45,
        clapDistance2d: 0.16,
        guardedHandDistance2d: 0.18,
    },
    wave: {
        minimumDurationMs: 400,
        cooldownMs: 650,
        windowMs: 1200,
        minAlternations: 2,
        minElevationRad: 0.05,
        minBodyLocalVelocityX: 0.05,
        minImageVelocityX: 0.12,
    },
    predictedSemanticHoldMs: 500,
    sideSwapHoldMs: 500,
};

const GESTURE_INTENT_MAP: Record<string, TimedArmIntent | undefined> = {
    Open_Palm: "explain",
    Pointing_Up: "pointing",
    Thumb_Up: "thumbsUp",
    Victory: "peace",
    Closed_Fist: "guarded",
};

function cloneTiming(
    config: Record<TimedArmIntent, IntentTimingConfig>,
): Record<TimedArmIntent, IntentTimingConfig> {
    return {
        pointing: { ...config.pointing },
        thumbsUp: { ...config.thumbsUp },
        peace: { ...config.peace },
        nearFace: { ...config.nearFace },
        explain: { ...config.explain },
        clapLike: { ...config.clapLike },
        guarded: { ...config.guarded },
        fallback: { ...config.fallback },
    };
}

function clampFinite(
    value: number | undefined,
    defaultValue: number,
    min: number,
    max: number,
): number {
    if (value === undefined || !Number.isFinite(value)) {
        return defaultValue;
    }
    return Math.min(max, Math.max(min, value));
}

function finiteOrDefault(value: number | undefined, defaultValue: number): number {
    return value === undefined || !Number.isFinite(value) ? defaultValue : value;
}

function normalizeConfig(
    config: MotionIntentEstimatorConfig | undefined,
): NormalizedEstimatorConfig {
    const timing = cloneTiming(DEFAULT_CONFIG.timing);
    for (const intent of TIMED_INTENTS) {
        const override = config?.timing?.[intent];
        timing[intent] = {
            minimumDurationMs: clampFinite(
                override?.minimumDurationMs,
                DEFAULT_CONFIG.timing[intent].minimumDurationMs,
                0,
                2000,
            ),
            cooldownMs: clampFinite(
                override?.cooldownMs,
                DEFAULT_CONFIG.timing[intent].cooldownMs,
                0,
                2000,
            ),
        };
    }

    const thresholds = {
        gestureConfidence: clampFinite(
            config?.thresholds?.gestureConfidence,
            DEFAULT_CONFIG.thresholds.gestureConfidence,
            0,
            1,
        ),
        handConfidence: clampFinite(
            config?.thresholds?.handConfidence,
            DEFAULT_CONFIG.thresholds.handConfidence,
            0,
            1,
        ),
        handReliability: clampFinite(
            config?.thresholds?.handReliability,
            DEFAULT_CONFIG.thresholds.handReliability,
            0,
            1,
        ),
        fingerReliability: clampFinite(
            config?.thresholds?.fingerReliability,
            DEFAULT_CONFIG.thresholds.fingerReliability,
            0,
            1,
        ),
        fallbackConfidence: clampFinite(
            config?.thresholds?.fallbackConfidence,
            DEFAULT_CONFIG.thresholds.fallbackConfidence,
            0,
            1,
        ),
        nearFaceElevationRad: clampFinite(
            config?.thresholds?.nearFaceElevationRad,
            DEFAULT_CONFIG.thresholds.nearFaceElevationRad,
            0,
            1,
        ),
        nearFaceForwardness: clampFinite(
            config?.thresholds?.nearFaceForwardness,
            DEFAULT_CONFIG.thresholds.nearFaceForwardness,
            0,
            1,
        ),
        clapDistance2d: clampFinite(
            config?.thresholds?.clapDistance2d,
            DEFAULT_CONFIG.thresholds.clapDistance2d,
            0,
            1,
        ),
        guardedHandDistance2d: clampFinite(
            config?.thresholds?.guardedHandDistance2d,
            DEFAULT_CONFIG.thresholds.guardedHandDistance2d,
            0,
            1,
        ),
    };

    return {
        timing,
        thresholds,
        wave: {
            minimumDurationMs: clampFinite(
                config?.wave?.minimumDurationMs,
                DEFAULT_CONFIG.wave.minimumDurationMs,
                0,
                2000,
            ),
            cooldownMs: clampFinite(
                config?.wave?.cooldownMs,
                DEFAULT_CONFIG.wave.cooldownMs,
                0,
                2000,
            ),
            windowMs: clampFinite(config?.wave?.windowMs, DEFAULT_CONFIG.wave.windowMs, 0, 2000),
            minAlternations: Math.round(
                clampFinite(
                    config?.wave?.minAlternations,
                    DEFAULT_CONFIG.wave.minAlternations,
                    0,
                    10,
                ),
            ),
            minElevationRad: finiteOrDefault(
                config?.wave?.minElevationRad,
                DEFAULT_CONFIG.wave.minElevationRad,
            ),
            minBodyLocalVelocityX: finiteOrDefault(
                config?.wave?.minBodyLocalVelocityX,
                DEFAULT_CONFIG.wave.minBodyLocalVelocityX,
            ),
            minImageVelocityX: finiteOrDefault(
                config?.wave?.minImageVelocityX,
                DEFAULT_CONFIG.wave.minImageVelocityX,
            ),
        },
        predictedSemanticHoldMs: clampFinite(
            config?.predictedSemanticHoldMs,
            DEFAULT_CONFIG.predictedSemanticHoldMs,
            200,
            700,
        ),
        sideSwapHoldMs: clampFinite(config?.sideSwapHoldMs, DEFAULT_CONFIG.sideSwapHoldMs, 0, 1000),
    };
}

function createTrackingSideState(input: {
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

function createIntentSideState(input: {
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

function createLostSideState(
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

function createFallbackSideState(input: {
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

function createInitialMemory(): SideMemory {
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

function isSemanticIntent(intent: ArmMotionIntent): intent is SemanticArmIntent {
    return intent !== "tracking" && intent !== "lost" && intent !== "fallback";
}

function getTiming(
    intent: TimedArmIntent | "wave",
    config: NormalizedEstimatorConfig,
): IntentTimingConfig {
    if (intent === "wave") {
        return {
            minimumDurationMs: config.wave.minimumDurationMs,
            cooldownMs: config.wave.cooldownMs,
        };
    }
    return config.timing[intent];
}

function getHandForSide(
    hand: SincroHandMotionSnapshot | undefined,
    side: ArmSide,
): SincroHandSideSnapshot | undefined {
    return side === "left" ? hand?.leftHand : hand?.rightHand;
}

function getGestureForSide(
    gesture: GestureIntentObservation | undefined,
    side: ArmSide,
): { label: string; confidence: number } | undefined {
    return side === "left" ? gesture?.left : gesture?.right;
}

function getReliabilityPart(
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

function getSideReliability(ctx: SideFrameContext): number {
    const handReliability = getReliabilityPart(ctx.reliability, ctx.side, "Hand");
    if (handReliability !== undefined) {
        return handReliability;
    }
    return ctx.hand?.confidence ?? ctx.arm.confidence;
}

function hasSideInconsistentWarning(input: MotionIntentEstimatorInput): boolean {
    if (input.reliability?.warnings.includes("side_inconsistent") === true) {
        return true;
    }
    return (
        input.hand?.leftHand.warnings.includes("side_inconsistent") === true ||
        input.hand?.rightHand.warnings.includes("side_inconsistent") === true
    );
}

function passesGestureGate(
    ctx: SideFrameContext,
    config: NormalizedEstimatorConfig,
): { ok: boolean; reliability: number; warnings: MotionIntentWarningCode[] } {
    const handConfidence = ctx.hand?.confidence ?? 0;
    const handReliability = getReliabilityPart(ctx.reliability, ctx.side, "Hand");
    const fingerReliability = getReliabilityPart(ctx.reliability, ctx.side, "Finger");
    const warnings: MotionIntentWarningCode[] = [];
    let ok = true;

    if ((ctx.gesture?.confidence ?? 0) < config.thresholds.gestureConfidence) {
        ok = false;
        warnings.push("gesture_unstable");
    }
    if (handConfidence < config.thresholds.handConfidence) {
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
        reliability: Math.min(handConfidence, handReliability ?? 1, fingerReliability ?? 1),
        warnings,
    };
}

function distance2d(left: readonly [number, number], right: readonly [number, number]): number {
    const dx = left[0] - right[0];
    const dy = left[1] - right[1];
    return Math.hypot(dx, dy);
}

function hasOpposedXVelocity(left: TemporalArmState, right: TemporalArmState): boolean {
    const leftX = left.velocity.wrist?.[0] ?? 0;
    const rightX = right.velocity.wrist?.[0] ?? 0;
    return Math.abs(leftX) > 0 && Math.abs(rightX) > 0 && leftX * rightX < 0;
}

function detectGlobalClapLike(
    input: MotionIntentEstimatorInput,
    config: NormalizedEstimatorConfig,
): boolean {
    const left = input.hand?.leftHand;
    const right = input.hand?.rightHand;
    if (
        left?.detected !== true ||
        right?.detected !== true ||
        left.fullFrameWrist === undefined ||
        right.fullFrameWrist === undefined
    ) {
        return false;
    }
    return (
        distance2d(left.fullFrameWrist, right.fullFrameWrist) <= config.thresholds.clapDistance2d &&
        hasOpposedXVelocity(input.temporal.arms.left, input.temporal.arms.right)
    );
}

function detectGlobalGuarded(
    input: MotionIntentEstimatorInput,
    config: NormalizedEstimatorConfig,
    sideSwapSuspect: boolean,
): boolean {
    if (
        input.temporal.arms.left.classification === "crossed" ||
        input.temporal.arms.right.classification === "crossed" ||
        sideSwapSuspect
    ) {
        return true;
    }
    const leftWrist = input.hand?.leftHand.fullFrameWrist;
    const rightWrist = input.hand?.rightHand.fullFrameWrist;
    if (leftWrist === undefined || rightWrist === undefined) {
        return false;
    }
    return (
        distance2d(leftWrist, rightWrist) <= config.thresholds.guardedHandDistance2d &&
        (input.temporal.arms.left.forwardness >= 0.35 ||
            input.temporal.arms.right.forwardness >= 0.35)
    );
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

function createMotionCandidate(
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

function uniqueWarnings(warnings: readonly MotionIntentWarningCode[]): MotionIntentWarningCode[] {
    return warnings.filter((warning, index) => warnings.indexOf(warning) === index);
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function semanticStateForHold(state: MotionIntentSideState): MotionIntentSideState | undefined {
    if (!isSemanticIntent(state.intent)) {
        return undefined;
    }
    return {
        ...state,
        warnings: [...state.warnings],
    };
}

function cloneSideStateWithWarnings(
    state: MotionIntentSideState,
    warnings: readonly MotionIntentWarningCode[],
): MotionIntentSideState {
    return {
        ...state,
        warnings: uniqueWarnings([...state.warnings, ...warnings]),
    };
}

export class MotionIntentEstimator {
    private readonly config: NormalizedEstimatorConfig;
    private previousMediaTimeMs: number | undefined;
    private readonly sides: Record<ArmSide, SideMemory>;
    private fallbackCandidateStartedAtMs: number | undefined;
    private fallbackStableDurationMs = 0;
    private sideSwapHoldUntilMs = 0;

    constructor(config?: MotionIntentEstimatorConfig) {
        this.config = normalizeConfig(config);
        this.sides = {
            left: createInitialMemory(),
            right: createInitialMemory(),
        };
    }

    update(input: MotionIntentEstimatorInput): MotionIntentState {
        const mediaTimeMs =
            Number.isFinite(input.mediaTimeMs) && input.mediaTimeMs >= 0 ? input.mediaTimeMs : 0;
        const dtMs =
            this.previousMediaTimeMs === undefined
                ? undefined
                : mediaTimeMs - this.previousMediaTimeMs;
        const invalidDt = dtMs !== undefined && (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 250);
        const validDtMs = invalidDt ? undefined : dtMs;
        const sideSwapSuspect = hasSideInconsistentWarning(input);
        if (sideSwapSuspect) {
            this.sideSwapHoldUntilMs = mediaTimeMs + this.config.sideSwapHoldMs;
        }
        const sideSwapHoldActive = mediaTimeMs <= this.sideSwapHoldUntilMs;
        const globalClapLike = detectGlobalClapLike(input, this.config);
        const globalGuarded = detectGlobalGuarded(input, this.config, sideSwapSuspect);
        const fallbackActive = this.updateFallbackCandidate(input, mediaTimeMs, validDtMs);
        const arms = {
            left: this.updateSide(
                {
                    side: "left",
                    arm: input.temporal.arms.left,
                    hand: getHandForSide(input.hand, "left"),
                    gesture: getGestureForSide(input.gesture, "left"),
                    reliability: input.reliability,
                    mediaTimeMs,
                    validDtMs,
                    invalidDt,
                    globalGuarded,
                    globalClapLike,
                    sideSwapSuspect: sideSwapHoldActive,
                },
                fallbackActive,
            ),
            right: this.updateSide(
                {
                    side: "right",
                    arm: input.temporal.arms.right,
                    hand: getHandForSide(input.hand, "right"),
                    gesture: getGestureForSide(input.gesture, "right"),
                    reliability: input.reliability,
                    mediaTimeMs,
                    validDtMs,
                    invalidDt,
                    globalGuarded,
                    globalClapLike,
                    sideSwapSuspect: sideSwapHoldActive,
                },
                fallbackActive,
            ),
        };

        this.previousMediaTimeMs = mediaTimeMs;
        for (const side of SIDES) {
            const wrist = getHandForSide(input.hand, side)?.fullFrameWrist;
            if (wrist !== undefined) {
                this.sides[side].previousWrist = [wrist[0], wrist[1]];
            }
        }

        const torsoConfidence = calculateTorsoConfidence(input);
        const torsoWarnings: MotionIntentWarningCode[] =
            torsoConfidence < this.config.thresholds.fallbackConfidence
                ? ["low_pose_reliability"]
                : [];
        const dtWarnings: MotionIntentWarningCode[] = invalidDt ? ["invalid_dt"] : [];
        const warnings = uniqueWarnings([
            ...arms.left.warnings,
            ...arms.right.warnings,
            ...torsoWarnings,
            ...dtWarnings,
        ]);

        return {
            schemaVersion: MOTION_INTENT_SCHEMA_VERSION,
            timestamp: { mediaTimeMs },
            arms,
            torso: {
                intent: "neutral",
                confidence: clamp01(torsoConfidence),
                source:
                    torsoConfidence < this.config.thresholds.fallbackConfidence
                        ? "fallback"
                        : "mixed",
                warnings: torsoWarnings,
            },
            warnings,
        };
    }

    reset(): void {
        this.previousMediaTimeMs = undefined;
        this.fallbackCandidateStartedAtMs = undefined;
        this.fallbackStableDurationMs = 0;
        this.sideSwapHoldUntilMs = 0;
        for (const side of SIDES) {
            this.sides[side] = createInitialMemory();
        }
    }

    private updateFallbackCandidate(
        input: MotionIntentEstimatorInput,
        mediaTimeMs: number,
        validDtMs: number | undefined,
    ): boolean {
        const torsoConfidence = calculateTorsoConfidence(input);
        const leftLow = isArmLostOrLow(
            input.temporal.arms.left,
            this.config.thresholds.fallbackConfidence,
        );
        const rightLow = isArmLostOrLow(
            input.temporal.arms.right,
            this.config.thresholds.fallbackConfidence,
        );
        const fallbackCandidate =
            leftLow && rightLow && torsoConfidence < this.config.thresholds.fallbackConfidence;
        if (!fallbackCandidate) {
            this.fallbackCandidateStartedAtMs = undefined;
            this.fallbackStableDurationMs = 0;
            return false;
        }
        if (this.fallbackCandidateStartedAtMs === undefined) {
            this.fallbackCandidateStartedAtMs = mediaTimeMs;
            this.fallbackStableDurationMs = 0;
        } else if (validDtMs !== undefined) {
            this.fallbackStableDurationMs += validDtMs;
        }
        return this.fallbackStableDurationMs >= this.config.timing.fallback.minimumDurationMs;
    }

    private updateSide(ctx: SideFrameContext, fallbackActive: boolean): MotionIntentSideState {
        const memory = this.sides[ctx.side];
        const warnings: MotionIntentWarningCode[] = ctx.invalidDt ? ["invalid_dt"] : [];
        if (ctx.sideSwapSuspect && memory.previousSemantic !== undefined) {
            const held = cloneSideStateWithWarnings(memory.previousSemantic, [
                "left_right_swap_suspect",
                ...warnings,
            ]);
            memory.lastState = held;
            return held;
        }
        if (fallbackActive) {
            return this.commitState(
                ctx,
                createFallbackSideState({
                    arm: ctx.arm,
                    stableDurationMs: this.fallbackStableDurationMs,
                    warnings,
                }),
            );
        }
        const predictedHold = this.getPredictedSemanticHold(ctx, memory, warnings);
        if (predictedHold !== undefined) {
            memory.lastState = predictedHold;
            return predictedHold;
        }
        if (isSideLost(ctx.arm, this.config.thresholds.fallbackConfidence)) {
            return this.commitState(ctx, createLostSideState(ctx.arm, warnings));
        }

        const candidate = createMotionCandidate(ctx, memory, this.config);
        const state =
            candidate === undefined
                ? this.createTrackingOrSuppressedState(ctx, memory, warnings)
                : this.applyCandidate(ctx, memory, candidate, warnings);
        return this.commitState(ctx, state);
    }

    private getPredictedSemanticHold(
        ctx: SideFrameContext,
        memory: SideMemory,
        warnings: readonly MotionIntentWarningCode[],
    ): MotionIntentSideState | undefined {
        if (ctx.arm.state !== "predicted" && ctx.arm.state !== "recovering") {
            memory.semanticHoldStartedAtMs = undefined;
            return undefined;
        }
        const previous = memory.previousSemantic;
        if (previous === undefined) {
            return undefined;
        }
        if (memory.semanticHoldStartedAtMs === undefined) {
            memory.semanticHoldStartedAtMs = ctx.mediaTimeMs;
        }
        if (
            ctx.mediaTimeMs - memory.semanticHoldStartedAtMs >
            this.config.predictedSemanticHoldMs
        ) {
            return undefined;
        }
        return cloneSideStateWithWarnings(previous, warnings);
    }

    private applyCandidate(
        ctx: SideFrameContext,
        memory: SideMemory,
        candidate: IntentCandidate,
        warnings: readonly MotionIntentWarningCode[],
    ): MotionIntentSideState {
        if (memory.candidateIntent !== candidate.intent) {
            memory.candidateIntent = candidate.intent;
            memory.candidateStartedAtMs = ctx.mediaTimeMs;
            memory.candidateStableDurationMs = 0;
        } else if (ctx.validDtMs !== undefined) {
            memory.candidateStableDurationMs += ctx.validDtMs;
        }
        const stableDurationMs = memory.candidateStableDurationMs;
        const timing = getTiming(candidate.intent, this.config);
        const cooldownUntil = memory.cooldownUntilMs[candidate.intent] ?? 0;
        const cooldownRemainingMs = Math.max(0, cooldownUntil - ctx.mediaTimeMs);
        if (cooldownRemainingMs > 0) {
            return createTrackingSideState({
                arm: ctx.arm,
                reliability: getSideReliability(ctx),
                warnings: uniqueWarnings(["gesture_cooldown", ...warnings]),
                cooldownRemainingMs,
            });
        }
        if (candidate.ready === false) {
            return createTrackingSideState({
                arm: ctx.arm,
                reliability: candidate.reliability,
                warnings: uniqueWarnings([...candidate.warnings, ...warnings]),
            });
        }
        if (stableDurationMs < timing.minimumDurationMs) {
            return createTrackingSideState({
                arm: ctx.arm,
                reliability: candidate.reliability,
                warnings: uniqueWarnings(["gesture_unstable", ...warnings]),
            });
        }
        return createIntentSideState({
            candidate: {
                ...candidate,
                warnings: uniqueWarnings([...candidate.warnings, ...warnings]),
            },
            arm: ctx.arm,
            stableDurationMs,
            cooldownRemainingMs: 0,
        });
    }

    private createTrackingOrSuppressedState(
        ctx: SideFrameContext,
        memory: SideMemory,
        warnings: readonly MotionIntentWarningCode[],
    ): MotionIntentSideState {
        const gestureLabel = ctx.gesture?.label;
        const nextWarnings: MotionIntentWarningCode[] = [...warnings];
        if (gestureLabel !== undefined && GESTURE_INTENT_MAP[gestureLabel] !== undefined) {
            nextWarnings.push(...passesGestureGate(ctx, this.config).warnings);
        }
        if (gestureLabel === "Open_Palm") {
            nextWarnings.push("wave_motion_missing");
        } else if (gestureLabel !== undefined && GESTURE_INTENT_MAP[gestureLabel] === undefined) {
            nextWarnings.push("gesture_unstable");
        }
        memory.candidateIntent = undefined;
        memory.candidateStartedAtMs = undefined;
        memory.candidateStableDurationMs = 0;
        return createTrackingSideState({
            arm: ctx.arm,
            reliability: getSideReliability(ctx),
            warnings: nextWarnings,
        });
    }

    private commitState(
        ctx: SideFrameContext,
        state: MotionIntentSideState,
    ): MotionIntentSideState {
        const memory = this.sides[ctx.side];
        if (isSemanticIntent(memory.activeIntent) && memory.activeIntent !== state.intent) {
            const timing = getTiming(memory.activeIntent, this.config);
            memory.cooldownUntilMs[memory.activeIntent] = ctx.mediaTimeMs + timing.cooldownMs;
        }
        memory.activeIntent = state.intent;
        memory.lastState = state;
        if (isSemanticIntent(state.intent)) {
            memory.previousSemantic = semanticStateForHold(state);
            memory.semanticHoldStartedAtMs = undefined;
        }
        if (state.intent !== "fallback") {
            memory.cooldownUntilMs.fallback = 0;
        }
        return state;
    }
}

function isArmLostOrLow(arm: TemporalArmState, threshold: number): boolean {
    return arm.state === "lost" || arm.confidence < threshold;
}

function isSideLost(arm: TemporalArmState, threshold: number): boolean {
    return arm.observedAgeMs > 700 || (arm.state === "lost" && arm.confidence < threshold);
}

function calculateTorsoConfidence(input: MotionIntentEstimatorInput): number {
    if (input.reliability?.parts.torso.finalWeight !== undefined) {
        return input.reliability.parts.torso.finalWeight;
    }
    return (input.temporal.arms.left.confidence + input.temporal.arms.right.confidence) / 2;
}

export function createMotionIntentState(
    input: MotionIntentEstimatorInput,
    config?: MotionIntentEstimatorConfig,
): MotionIntentState {
    return new MotionIntentEstimator(config).update(input);
}
