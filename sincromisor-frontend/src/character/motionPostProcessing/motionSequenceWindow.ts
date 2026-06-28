import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { ArmMotionIntent, MotionIntentState } from "../motionIntent/motionIntentState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";

export const MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION = "sincro.motion-sequence-window.v1" as const;

const DEFAULT_SEQUENCE_WINDOW_CONFIG = {
    maxDurationMs: 1200,
    maxSamples: 90,
};

const SEMANTIC_ARM_INTENTS = [
    "wave",
    "pointing",
    "thumbsUp",
    "peace",
    "nearFace",
    "explain",
    "clapLike",
    "guarded",
] as const;

type MotionSide = "left" | "right";
type ArmPartName = "leftArm" | "rightArm";
type ArmJointName =
    | "leftShoulder"
    | "leftElbow"
    | "leftWrist"
    | "rightShoulder"
    | "rightElbow"
    | "rightWrist";
type MotionSequenceWindowWarning = "non_monotonic_time_reset";
type SemanticArmMotionIntent = (typeof SEMANTIC_ARM_INTENTS)[number];
type HandOpenCloseState = "open" | "closed";

export type MotionSequenceSample = {
    mediaTimeMs: number;
    temporal?: TemporalUpperBodyState;
    intent?: MotionIntentState;
    reliability?: ReliabilityMap;
    hand?: SincroHandMotionSnapshot;
};

export type MotionSequenceWindowConfig = {
    maxDurationMs: number;
    maxSamples: number;
};

export type MotionSequenceSideFeatures = {
    intentTransitions: number;
    semanticHoldMs: number;
    stableSemanticIntent?: ArmMotionIntent;
    gestureFlickerCount: number;
    trackingLossMs: number;
    sideSwapSuspectCount: number;
    wristVelocitySignChanges: number;
    handOpenCloseTransitions: number;
};

export type MotionSequenceWindowSnapshot = {
    schemaVersion: typeof MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION;
    startMediaTimeMs: number;
    endMediaTimeMs: number;
    sampleCount: number;
    inputAvailability: {
        temporal: boolean;
        intent: boolean;
        reliability: boolean;
        hand: boolean;
    };
    warnings: MotionSequenceWindowWarning[];
    features: {
        left: MotionSequenceSideFeatures;
        right: MotionSequenceSideFeatures;
    };
};

type SemanticRun = {
    intent: SemanticArmMotionIntent;
    durationMs: number;
};

function createEmptySideFeatures(): MotionSequenceSideFeatures {
    return {
        intentTransitions: 0,
        semanticHoldMs: 0,
        gestureFlickerCount: 0,
        trackingLossMs: 0,
        sideSwapSuspectCount: 0,
        wristVelocitySignChanges: 0,
        handOpenCloseTransitions: 0,
    };
}

function isSemanticIntent(intent: ArmMotionIntent): intent is SemanticArmMotionIntent {
    switch (intent) {
        case "wave":
        case "pointing":
        case "thumbsUp":
        case "peace":
        case "nearFace":
        case "explain":
        case "clapLike":
        case "guarded":
            return true;
        case "tracking":
        case "lost":
        case "fallback":
            return false;
    }
}

function durationToNext(samples: readonly MotionSequenceSample[], index: number): number {
    const next = samples[index + 1];
    if (next === undefined) {
        return 0;
    }
    return Math.max(0, next.mediaTimeMs - samples[index].mediaTimeMs);
}

function sidePartName(side: MotionSide): ArmPartName {
    return side === "left" ? "leftArm" : "rightArm";
}

function sideJointNames(side: MotionSide): readonly ArmJointName[] {
    return side === "left"
        ? ["leftShoulder", "leftElbow", "leftWrist"]
        : ["rightShoulder", "rightElbow", "rightWrist"];
}

function hasSideSwapWarning(sample: MotionSequenceSample, side: MotionSide): boolean {
    const intentWarnings = sample.intent?.arms[side].warnings ?? [];
    if (intentWarnings.includes("left_right_swap_suspect")) {
        return true;
    }

    const reliability = sample.reliability;
    if (reliability === undefined) {
        return false;
    }
    if (reliability.warnings.includes("side_inconsistent")) {
        return true;
    }

    const armPart = reliability.parts[sidePartName(side)];
    if (armPart.warnings.includes("side_inconsistent")) {
        return true;
    }

    return sideJointNames(side).some((jointName) =>
        reliability.joints[jointName].warnings.includes("side_inconsistent"),
    );
}

function hasTrackingLoss(sample: MotionSequenceSample, side: MotionSide): boolean {
    if (sample.temporal?.arms[side].state === "lost") {
        return true;
    }
    const intent = sample.intent?.arms[side].intent;
    if (intent === "lost" || intent === "fallback") {
        return true;
    }
    return sample.reliability?.parts[sidePartName(side)].state === "lost";
}

function updateSemanticRun(
    currentRun: SemanticRun | undefined,
    bestRun: SemanticRun | undefined,
    intent: ArmMotionIntent,
    durationMs: number,
): { currentRun?: SemanticRun; bestRun?: SemanticRun } {
    if (!isSemanticIntent(intent)) {
        return { bestRun: selectBestRun(bestRun, currentRun) };
    }
    if (currentRun !== undefined && currentRun.intent === intent) {
        return {
            currentRun: {
                intent: currentRun.intent,
                durationMs: currentRun.durationMs + durationMs,
            },
            bestRun,
        };
    }
    return {
        currentRun: { intent, durationMs },
        bestRun: selectBestRun(bestRun, currentRun),
    };
}

function selectBestRun(
    bestRun: SemanticRun | undefined,
    candidate: SemanticRun | undefined,
): SemanticRun | undefined {
    if (candidate === undefined) {
        return bestRun;
    }
    if (bestRun === undefined || candidate.durationMs > bestRun.durationMs) {
        return candidate;
    }
    return bestRun;
}

function handOpenCloseState(
    sample: MotionSequenceSample,
    side: MotionSide,
): HandOpenCloseState | undefined {
    const openness =
        side === "left"
            ? sample.hand?.leftHand.features.openness
            : sample.hand?.rightHand.features.openness;
    if (openness === "open" || openness === "closed") {
        return openness;
    }
    return undefined;
}

function aggregateSideFeatures(
    samples: readonly MotionSequenceSample[],
    side: MotionSide,
): MotionSequenceSideFeatures {
    const features = createEmptySideFeatures();
    let previousIntent: ArmMotionIntent | undefined;
    let previousFlickerIntent: ArmMotionIntent | undefined;
    let previousFlickerStableDurationMs = 0;
    let currentRun: SemanticRun | undefined;
    let bestRun: SemanticRun | undefined;
    let previousWristSign: -1 | 1 | undefined;
    let previousHandState: HandOpenCloseState | undefined;

    for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];
        const durationMs = durationToNext(samples, index);
        const sideIntent = sample.intent?.arms[side];

        if (sideIntent !== undefined) {
            if (previousIntent !== undefined && sideIntent.intent !== previousIntent) {
                features.intentTransitions += 1;
            }
            if (
                previousFlickerIntent !== undefined &&
                isSemanticIntent(previousFlickerIntent) &&
                previousFlickerStableDurationMs < 150 &&
                (sideIntent.intent === "tracking" ||
                    (isSemanticIntent(sideIntent.intent) &&
                        sideIntent.intent !== previousFlickerIntent))
            ) {
                features.gestureFlickerCount += 1;
            }
            const runUpdate = updateSemanticRun(currentRun, bestRun, sideIntent.intent, durationMs);
            currentRun = runUpdate.currentRun;
            bestRun = runUpdate.bestRun;
            previousIntent = sideIntent.intent;
            previousFlickerIntent = sideIntent.intent;
            previousFlickerStableDurationMs = sideIntent.stableDurationMs;
        }

        if (hasTrackingLoss(sample, side)) {
            features.trackingLossMs += durationMs;
        }
        if (hasSideSwapWarning(sample, side)) {
            features.sideSwapSuspectCount += 1;
        }

        const wristX = sample.temporal?.arms[side].velocity.wrist?.[0];
        if (wristX !== undefined && Number.isFinite(wristX) && Math.abs(wristX) >= 0.02) {
            const sign = wristX > 0 ? 1 : -1;
            if (previousWristSign !== undefined && sign !== previousWristSign) {
                features.wristVelocitySignChanges += 1;
            }
            previousWristSign = sign;
        }

        const handState = handOpenCloseState(sample, side);
        if (handState !== undefined) {
            if (previousHandState !== undefined && handState !== previousHandState) {
                features.handOpenCloseTransitions += 1;
            }
            previousHandState = handState;
        }
    }

    const selectedRun = selectBestRun(bestRun, currentRun);
    if (selectedRun !== undefined) {
        features.semanticHoldMs = selectedRun.durationMs;
        features.stableSemanticIntent = selectedRun.intent;
    }
    return features;
}

function emptySnapshot(
    warnings: readonly MotionSequenceWindowWarning[],
): MotionSequenceWindowSnapshot {
    return {
        schemaVersion: MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION,
        startMediaTimeMs: 0,
        endMediaTimeMs: 0,
        sampleCount: 0,
        inputAvailability: {
            temporal: false,
            intent: false,
            reliability: false,
            hand: false,
        },
        warnings: [...warnings],
        features: {
            left: createEmptySideFeatures(),
            right: createEmptySideFeatures(),
        },
    };
}

export class MotionSequenceWindow {
    private readonly config: MotionSequenceWindowConfig;
    private samples: MotionSequenceSample[] = [];
    private warnings: MotionSequenceWindowWarning[] = [];

    constructor(config: Partial<MotionSequenceWindowConfig> = {}) {
        this.config = {
            maxDurationMs: config.maxDurationMs ?? DEFAULT_SEQUENCE_WINDOW_CONFIG.maxDurationMs,
            maxSamples: config.maxSamples ?? DEFAULT_SEQUENCE_WINDOW_CONFIG.maxSamples,
        };
    }

    add(sample: MotionSequenceSample): MotionSequenceWindowSnapshot {
        const previousSample = this.samples[this.samples.length - 1];
        if (previousSample !== undefined && sample.mediaTimeMs < previousSample.mediaTimeMs) {
            this.samples = [];
            this.warnings = ["non_monotonic_time_reset"];
        }
        this.samples.push(sample);
        this.evictSamples();
        return this.snapshot();
    }

    snapshot(): MotionSequenceWindowSnapshot {
        const sortedSamples = [...this.samples].sort(
            (left, right) => left.mediaTimeMs - right.mediaTimeMs,
        );
        const firstSample = sortedSamples[0];
        const lastSample = sortedSamples[sortedSamples.length - 1];
        if (firstSample === undefined || lastSample === undefined) {
            return emptySnapshot(this.warnings);
        }

        return {
            schemaVersion: MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION,
            startMediaTimeMs: firstSample.mediaTimeMs,
            endMediaTimeMs: lastSample.mediaTimeMs,
            sampleCount: sortedSamples.length,
            inputAvailability: {
                temporal: sortedSamples.some((sample) => sample.temporal !== undefined),
                intent: sortedSamples.some((sample) => sample.intent !== undefined),
                reliability: sortedSamples.some((sample) => sample.reliability !== undefined),
                hand: sortedSamples.some((sample) => sample.hand !== undefined),
            },
            warnings: [...this.warnings],
            features: {
                left: aggregateSideFeatures(sortedSamples, "left"),
                right: aggregateSideFeatures(sortedSamples, "right"),
            },
        };
    }

    reset(): void {
        this.samples = [];
        this.warnings = [];
    }

    private evictSamples(): void {
        while (this.samples.length > this.config.maxSamples) {
            this.samples.shift();
        }
        let lastSample = this.samples[this.samples.length - 1];
        let firstSample = this.samples[0];
        while (
            firstSample !== undefined &&
            lastSample !== undefined &&
            lastSample.mediaTimeMs - firstSample.mediaTimeMs > this.config.maxDurationMs
        ) {
            this.samples.shift();
            firstSample = this.samples[0];
            lastSample = this.samples[this.samples.length - 1];
        }
    }
}
