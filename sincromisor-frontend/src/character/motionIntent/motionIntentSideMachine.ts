import type { TemporalArmState } from "../temporal/temporalUpperBodyState";
import {
    createMotionCandidate,
    detectMotionFallbackCandidate,
    GESTURE_INTENT_MAP,
    getSideReliability,
    passesGestureGate,
} from "./motionIntentCandidateDetectors";
import { SIDES } from "./motionIntentEstimatorConfig";
import type {
    ArmSide,
    IntentCandidate,
    MotionIntentEstimatorInput,
    NormalizedEstimatorConfig,
    SideFrameContext,
    SideMemory,
} from "./motionIntentEstimatorTypes";
import {
    cloneSideStateWithWarnings,
    createFallbackSideState,
    createInitialMemory,
    createIntentSideState,
    createLostSideState,
    createTrackingSideState,
    getTiming,
    isSemanticIntent,
    semanticStateForHold,
    uniqueWarnings,
} from "./motionIntentSideState";
import type { MotionIntentSideState, MotionIntentWarningCode } from "./motionIntentState";

export class MotionIntentSideMachine {
    private readonly sides: Record<ArmSide, SideMemory>;
    private fallbackCandidateStartedAtMs: number | undefined;
    private fallbackStableDurationMs = 0;

    constructor(private readonly config: NormalizedEstimatorConfig) {
        this.sides = {
            left: createInitialMemory(),
            right: createInitialMemory(),
        };
    }

    updateFallbackCandidate(input: {
        frame: MotionIntentEstimatorInput;
        mediaTimeMs: number;
        validDtMs: number | undefined;
    }): { active: boolean; stableDurationMs: number } {
        const fallbackCandidate = detectMotionFallbackCandidate(input.frame, this.config);
        if (!fallbackCandidate) {
            this.fallbackCandidateStartedAtMs = undefined;
            this.fallbackStableDurationMs = 0;
            return { active: false, stableDurationMs: 0 };
        }
        if (this.fallbackCandidateStartedAtMs === undefined) {
            this.fallbackCandidateStartedAtMs = input.mediaTimeMs;
            this.fallbackStableDurationMs = 0;
        } else if (input.validDtMs !== undefined) {
            this.fallbackStableDurationMs += input.validDtMs;
        }
        return {
            active: this.fallbackStableDurationMs >= this.config.timing.fallback.minimumDurationMs,
            stableDurationMs: this.fallbackStableDurationMs,
        };
    }

    updateSide(input: {
        ctx: SideFrameContext;
        fallbackActive: boolean;
        fallbackStableDurationMs: number;
    }): MotionIntentSideState {
        const { ctx, fallbackActive, fallbackStableDurationMs } = input;
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
        const predictedHold = this.getPredictedSemanticHold(ctx, memory, warnings);
        if (predictedHold !== undefined) {
            memory.lastState = predictedHold;
            return predictedHold;
        }
        if (fallbackActive) {
            return this.commitState(
                ctx,
                createFallbackSideState({
                    arm: ctx.arm,
                    stableDurationMs: fallbackStableDurationMs,
                    warnings,
                }),
            );
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

    updatePreviousWrist(side: ArmSide, wrist: readonly [number, number]): void {
        this.sides[side].previousWrist = [wrist[0], wrist[1]];
    }

    reset(): void {
        this.fallbackCandidateStartedAtMs = undefined;
        this.fallbackStableDurationMs = 0;
        for (const side of SIDES) {
            this.sides[side] = createInitialMemory();
        }
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

function isSideLost(arm: TemporalArmState, threshold: number): boolean {
    return arm.observedAgeMs > 700 || (arm.state === "lost" && arm.confidence < threshold);
}
