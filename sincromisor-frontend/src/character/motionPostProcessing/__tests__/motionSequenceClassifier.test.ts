import { describe, expect, it } from "vitest";
import { MOTION_POST_PROCESSING_SCHEMA_VERSION } from "../motionPostProcessingState";
import {
    classifyMotionSequence,
    MOTION_SEQUENCE_CLASSIFIER_SCHEMA_VERSION,
} from "../motionSequenceClassifier";
import {
    MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION,
    type MotionSequenceSideFeatures,
    type MotionSequenceWindowSnapshot,
} from "../motionSequenceWindow";

function emptyFeatures(): MotionSequenceSideFeatures {
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

function createSnapshot(input: {
    left?: Partial<MotionSequenceSideFeatures>;
    right?: Partial<MotionSequenceSideFeatures>;
}): MotionSequenceWindowSnapshot {
    return {
        schemaVersion: MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION,
        startMediaTimeMs: 100,
        endMediaTimeMs: 900,
        sampleCount: 9,
        inputAvailability: {
            temporal: true,
            intent: true,
            reliability: true,
            hand: true,
        },
        warnings: [],
        features: {
            left: { ...emptyFeatures(), ...input.left },
            right: { ...emptyFeatures(), ...input.right },
        },
    };
}

describe("classifyMotionSequence", () => {
    it("detects wave sequences without creating corrections", () => {
        const result = classifyMotionSequence(
            createSnapshot({
                left: {
                    wristVelocitySignChanges: 2,
                    semanticHoldMs: 400,
                    trackingLossMs: 100,
                },
            }),
            { mediaTimeMs: 920, source: "fixture" },
        );

        expect(result.schemaVersion).toBe(MOTION_SEQUENCE_CLASSIFIER_SCHEMA_VERSION);
        expect(result.events).toEqual([
            {
                label: "wave_sequence",
                side: "left",
                confidence: 2 / 3,
                source: "rule_based",
                reasonCode: "wave_sequence",
                featureValue: 2,
                startMediaTimeMs: 100,
                endMediaTimeMs: 900,
            },
        ]);
        expect(result.postProcessing.corrections).toEqual([]);
        expect(result.postProcessing.output).toEqual({});
    });

    it("detects gesture flicker and emits an intent correction", () => {
        const result = classifyMotionSequence(
            createSnapshot({ left: { gestureFlickerCount: 2 } }),
            { mediaTimeMs: 920, source: "replay" },
        );

        expect(result.events[0]).toMatchObject({
            label: "gesture_flicker",
            confidence: 2 / 3,
            featureValue: 2,
        });
        expect(result.postProcessing.corrections).toEqual([
            {
                target: "intent",
                path: "arms.left.intent",
                kind: "gesture_sequence_classification",
                reasonCode: "gesture_flicker",
                confidence: 2 / 3,
            },
        ]);
    });

    it("detects side swap anomalies and emits a canonical rejection correction", () => {
        const result = classifyMotionSequence(
            createSnapshot({ right: { sideSwapSuspectCount: 1 } }),
            { mediaTimeMs: 920, source: "live", processorId: "test-sequence" },
        );

        expect(result.events[0]).toMatchObject({
            label: "side_swap_anomaly",
            side: "right",
            confidence: 1,
            featureValue: 1,
        });
        expect(result.postProcessing.processor).toEqual({
            id: "test-sequence",
            version: "v1",
            mode: "rule_based",
        });
        expect(result.postProcessing.corrections).toEqual([
            {
                target: "canonical",
                path: "arms.right",
                kind: "anomaly_rejection",
                reasonCode: "side_swap_suspect",
                confidence: 1,
            },
        ]);
    });

    it("detects tracking loss anomalies and emits a temporal rejection correction", () => {
        const result = classifyMotionSequence(createSnapshot({ left: { trackingLossMs: 300 } }), {
            mediaTimeMs: 920,
            source: "fixture",
        });

        expect(result.events[0]).toMatchObject({
            label: "tracking_loss_anomaly",
            side: "left",
            confidence: 0.5,
            featureValue: 300,
        });
        expect(result.postProcessing.corrections).toEqual([
            {
                target: "temporal",
                path: "arms.left.state",
                kind: "anomaly_rejection",
                reasonCode: "tracking_loss",
                confidence: 0.5,
            },
        ]);
    });

    it("detects stable semantic holds without creating corrections", () => {
        const result = classifyMotionSequence(
            createSnapshot({
                left: {
                    semanticHoldMs: 600,
                    stableSemanticIntent: "pointing",
                    gestureFlickerCount: 0,
                },
            }),
            { mediaTimeMs: 920, source: "fixture" },
        );

        expect(result.events).toEqual([
            {
                label: "stable_semantic_hold",
                side: "left",
                confidence: 2 / 3,
                source: "rule_based",
                reasonCode: "stable_semantic_hold",
                featureValue: 600,
                startMediaTimeMs: 100,
                endMediaTimeMs: 900,
            },
        ]);
        expect(result.postProcessing.corrections).toEqual([]);
    });

    it("keeps deterministic event order and post-processing as correction-only output", () => {
        const result = classifyMotionSequence(
            createSnapshot({
                left: {
                    wristVelocitySignChanges: 3,
                    semanticHoldMs: 700,
                    gestureFlickerCount: 2,
                    sideSwapSuspectCount: 1,
                    trackingLossMs: 300,
                    stableSemanticIntent: "wave",
                },
                right: {
                    gestureFlickerCount: 3,
                    sideSwapSuspectCount: 1,
                    trackingLossMs: 600,
                },
            }),
            { mediaTimeMs: 920, source: "fixture" },
        );

        expect(result.events.map((event) => `${event.label}:${event.side}`)).toEqual([
            "gesture_flicker:left",
            "gesture_flicker:right",
            "side_swap_anomaly:left",
            "side_swap_anomaly:right",
            "tracking_loss_anomaly:left",
            "tracking_loss_anomaly:right",
        ]);
        expect(result.postProcessing).toMatchObject({
            schemaVersion: MOTION_POST_PROCESSING_SCHEMA_VERSION,
            timestamp: { mediaTimeMs: 920 },
            inputAvailability: {
                canonical: false,
                temporal: true,
                intent: true,
                reliability: true,
            },
            output: {},
            warnings: [],
        });
        expect(
            result.postProcessing.corrections.map((correction) => correction.reasonCode),
        ).toEqual([
            "gesture_flicker",
            "gesture_flicker",
            "side_swap_suspect",
            "side_swap_suspect",
            "tracking_loss",
            "tracking_loss",
        ]);
    });

    it("returns low confidence warning when no rule fires", () => {
        const result = classifyMotionSequence(createSnapshot({}), {
            mediaTimeMs: 920,
            source: "fixture",
        });

        expect(result.events).toEqual([]);
        expect(result.postProcessing.corrections).toEqual([]);
        expect(result.postProcessing.warnings).toEqual(["low_confidence"]);
    });
});
