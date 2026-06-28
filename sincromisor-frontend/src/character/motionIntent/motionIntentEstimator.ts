/**
 * MotionIntentEstimator の既存 import 互換 facade と stateful estimator 本体。
 * 入力は temporal / reliability / hand / optional gesture と caller 指定 mediaTimeMs に限定し、reset は camera stop や replay source reset で hysteresis を破棄する lifecycle 境界になる。
 */
import { clamp01, normalizeConfig, SIDES } from "./motionIntentEstimatorConfig";
import type {
    MotionIntentEstimatorConfig,
    MotionIntentEstimatorInput,
    NormalizedEstimatorConfig,
} from "./motionIntentEstimatorTypes";
import {
    calculateTorsoConfidence,
    detectGlobalClapLike,
    detectGlobalGuarded,
    getGestureForSide,
    getHandForSide,
    hasSideInconsistentWarning,
} from "./motionIntentGlobalDetectors";
import { MotionIntentSideMachine } from "./motionIntentSideMachine";
import { uniqueWarnings } from "./motionIntentSideState";
import {
    MOTION_INTENT_SCHEMA_VERSION,
    type MotionIntentState,
    type MotionIntentWarningCode,
} from "./motionIntentState";

export type {
    GestureIntentObservation,
    IntentTimingConfig,
    MotionIntentEstimatorConfig,
    MotionIntentEstimatorInput,
} from "./motionIntentEstimatorTypes";

/**
 * temporal / reliability / hand / optional gesture だけを入力境界にする intent estimator。
 * VRM bone、Three.js runtime object、MediaPipe raw result は読まない。
 */
export class MotionIntentEstimator {
    private readonly config: NormalizedEstimatorConfig;
    private readonly sideMachine: MotionIntentSideMachine;
    private previousMediaTimeMs: number | undefined;
    private sideSwapHoldUntilMs = 0;

    constructor(config?: MotionIntentEstimatorConfig) {
        this.config = normalizeConfig(config);
        this.sideMachine = new MotionIntentSideMachine(this.config);
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
            // 左右入れ替わり warning は瞬間で消えることがあるため、短時間 semantic を保持する。
            this.sideSwapHoldUntilMs = mediaTimeMs + this.config.sideSwapHoldMs;
        }
        const sideSwapHoldActive = mediaTimeMs <= this.sideSwapHoldUntilMs;
        const globalClapLike = detectGlobalClapLike(input, this.config);
        const globalGuarded = detectGlobalGuarded(input, this.config, sideSwapSuspect);
        const fallback = this.sideMachine.updateFallbackCandidate({
            frame: input,
            mediaTimeMs,
            validDtMs,
        });
        const arms = {
            left: this.sideMachine.updateSide({
                ctx: {
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
                fallbackActive: fallback.active,
                fallbackStableDurationMs: fallback.stableDurationMs,
            }),
            right: this.sideMachine.updateSide({
                ctx: {
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
                fallbackActive: fallback.active,
                fallbackStableDurationMs: fallback.stableDurationMs,
            }),
        };

        this.previousMediaTimeMs = mediaTimeMs;
        for (const side of SIDES) {
            const wrist = getHandForSide(input.hand, side)?.fullFrameWrist;
            if (wrist !== undefined) {
                this.sideMachine.updatePreviousWrist(side, wrist);
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
        this.sideSwapHoldUntilMs = 0;
        this.sideMachine.reset();
    }
}

export function createMotionIntentState(
    input: MotionIntentEstimatorInput,
    config?: MotionIntentEstimatorConfig,
): MotionIntentState {
    return new MotionIntentEstimator(config).update(input);
}
