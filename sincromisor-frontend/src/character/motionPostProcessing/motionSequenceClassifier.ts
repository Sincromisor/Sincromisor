import {
    MOTION_POST_PROCESSING_SCHEMA_VERSION,
    type MotionPostProcessingCorrection,
    type MotionPostProcessingResult,
} from "./motionPostProcessingState";
import type {
    MotionSequenceSideFeatures,
    MotionSequenceWindowSnapshot,
} from "./motionSequenceWindow";

export const MOTION_SEQUENCE_CLASSIFIER_SCHEMA_VERSION =
    "sincro.motion-sequence-classifier.v1" as const;

type MotionSequenceEventLabel =
    | "wave_sequence"
    | "gesture_flicker"
    | "side_swap_anomaly"
    | "tracking_loss_anomaly"
    | "stable_semantic_hold";
type MotionSequenceSide = "left" | "right";

export type MotionSequenceClassifierInput = {
    mediaTimeMs: number;
    source: "live" | "replay" | "fixture";
    processorId?: string;
};

export type MotionSequenceEvent = {
    label: MotionSequenceEventLabel;
    side: MotionSequenceSide;
    confidence: number;
    source: "rule_based";
    reasonCode: MotionSequenceEventLabel;
    featureValue: number;
    startMediaTimeMs: number;
    endMediaTimeMs: number;
};

export type MotionSequenceClassifierResult = {
    schemaVersion: typeof MOTION_SEQUENCE_CLASSIFIER_SCHEMA_VERSION;
    events: MotionSequenceEvent[];
    postProcessing: MotionPostProcessingResult;
};

function createEvent(input: {
    label: MotionSequenceEventLabel;
    side: MotionSequenceSide;
    confidence: number;
    featureValue: number;
    snapshot: MotionSequenceWindowSnapshot;
}): MotionSequenceEvent {
    return {
        label: input.label,
        side: input.side,
        confidence: Math.min(1, Math.max(0, input.confidence)),
        source: "rule_based",
        reasonCode: input.label,
        featureValue: input.featureValue,
        startMediaTimeMs: input.snapshot.startMediaTimeMs,
        endMediaTimeMs: input.snapshot.endMediaTimeMs,
    };
}

function classifySideEvents(
    snapshot: MotionSequenceWindowSnapshot,
    side: MotionSequenceSide,
    features: MotionSequenceSideFeatures,
    label: MotionSequenceEventLabel,
): MotionSequenceEvent[] {
    if (
        label === "wave_sequence" &&
        features.wristVelocitySignChanges >= 2 &&
        features.semanticHoldMs < 500 &&
        features.trackingLossMs < 200
    ) {
        return [
            createEvent({
                label,
                side,
                confidence: features.wristVelocitySignChanges / 3,
                featureValue: features.wristVelocitySignChanges,
                snapshot,
            }),
        ];
    }
    if (label === "gesture_flicker" && features.gestureFlickerCount >= 2) {
        return [
            createEvent({
                label,
                side,
                confidence: features.gestureFlickerCount / 3,
                featureValue: features.gestureFlickerCount,
                snapshot,
            }),
        ];
    }
    if (label === "side_swap_anomaly" && features.sideSwapSuspectCount >= 1) {
        return [
            createEvent({
                label,
                side,
                confidence: 1,
                featureValue: features.sideSwapSuspectCount,
                snapshot,
            }),
        ];
    }
    if (label === "tracking_loss_anomaly" && features.trackingLossMs >= 300) {
        return [
            createEvent({
                label,
                side,
                confidence: features.trackingLossMs / 600,
                featureValue: features.trackingLossMs,
                snapshot,
            }),
        ];
    }
    if (
        label === "stable_semantic_hold" &&
        features.stableSemanticIntent !== undefined &&
        features.semanticHoldMs >= 600 &&
        features.gestureFlickerCount === 0
    ) {
        return [
            createEvent({
                label,
                side,
                confidence: features.semanticHoldMs / 900,
                featureValue: features.semanticHoldMs,
                snapshot,
            }),
        ];
    }
    return [];
}

function buildEvents(snapshot: MotionSequenceWindowSnapshot): MotionSequenceEvent[] {
    const labels: readonly MotionSequenceEventLabel[] = [
        "wave_sequence",
        "gesture_flicker",
        "side_swap_anomaly",
        "tracking_loss_anomaly",
        "stable_semantic_hold",
    ];
    const sides: readonly MotionSequenceSide[] = ["left", "right"];
    const events: MotionSequenceEvent[] = [];
    for (const label of labels) {
        for (const side of sides) {
            events.push(...classifySideEvents(snapshot, side, snapshot.features[side], label));
        }
    }
    return events;
}

function correctionForEvent(
    event: MotionSequenceEvent,
): MotionPostProcessingCorrection | undefined {
    if (event.label === "gesture_flicker") {
        return {
            target: "intent",
            path: `arms.${event.side}.intent`,
            kind: "gesture_sequence_classification",
            reasonCode: "gesture_flicker",
            confidence: event.confidence,
        };
    }
    if (event.label === "side_swap_anomaly") {
        return {
            target: "canonical",
            path: `arms.${event.side}`,
            kind: "anomaly_rejection",
            reasonCode: "side_swap_suspect",
            confidence: event.confidence,
        };
    }
    if (event.label === "tracking_loss_anomaly") {
        return {
            target: "temporal",
            path: `arms.${event.side}.state`,
            kind: "anomaly_rejection",
            reasonCode: "tracking_loss",
            confidence: event.confidence,
        };
    }
    return undefined;
}

function buildPostProcessingResult(
    snapshot: MotionSequenceWindowSnapshot,
    events: readonly MotionSequenceEvent[],
    input: MotionSequenceClassifierInput,
): MotionPostProcessingResult {
    const corrections: MotionPostProcessingCorrection[] = [];
    for (const event of events) {
        const correction = correctionForEvent(event);
        if (correction !== undefined) {
            corrections.push(correction);
        }
    }

    return {
        schemaVersion: MOTION_POST_PROCESSING_SCHEMA_VERSION,
        timestamp: { mediaTimeMs: input.mediaTimeMs },
        processor: {
            id: input.processorId ?? "rule-sequence-classifier",
            version: "v1",
            mode: "rule_based",
        },
        inputAvailability: {
            canonical: false,
            temporal: snapshot.inputAvailability.temporal,
            intent: snapshot.inputAvailability.intent,
            reliability: snapshot.inputAvailability.reliability,
        },
        output: {},
        corrections,
        warnings: events.length === 0 ? ["low_confidence"] : [],
    };
}

export function classifyMotionSequence(
    snapshot: MotionSequenceWindowSnapshot,
    input: MotionSequenceClassifierInput,
): MotionSequenceClassifierResult {
    const events = buildEvents(snapshot);
    return {
        schemaVersion: MOTION_SEQUENCE_CLASSIFIER_SCHEMA_VERSION,
        events,
        postProcessing: buildPostProcessingResult(snapshot, events, input),
    };
}
