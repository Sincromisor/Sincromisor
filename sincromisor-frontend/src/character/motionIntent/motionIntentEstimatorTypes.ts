/**
 * MotionIntentEstimator の入力、config、candidate、side memory の型境界を定義する。
 * 型は replay / motion-debug に保存する MotionIntentState そのものではなく、estimator 内部の hysteresis と detection context を表す。
 */
import type {
    SincroHandMotionSnapshot,
    SincroHandSideSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { TemporalArmState, TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import type {
    ArmMotionIntent,
    MotionIntentSideState,
    MotionIntentWarningCode,
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

export type ArmSide = "left" | "right";
export type TimedArmIntent = Exclude<ArmMotionIntent, "tracking" | "lost" | "wave">;
export type SemanticArmIntent = Exclude<ArmMotionIntent, "tracking" | "lost" | "fallback">;

export type NormalizedEstimatorConfig = {
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

export type IntentCandidate = {
    intent: TimedArmIntent | "wave";
    source: MotionIntentSideState["source"];
    confidence: number;
    reliability: number;
    expressiveness: number;
    ready?: boolean;
    sourceGestureLabel?: string;
    warnings: MotionIntentWarningCode[];
};

export type SideFrameContext = {
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

export type SideMemory = {
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
