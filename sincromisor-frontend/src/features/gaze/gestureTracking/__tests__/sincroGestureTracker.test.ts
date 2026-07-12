import type { Category, GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";

import {
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_LEFT_HAND_SNAPSHOT,
    DEFAULT_SINCRO_RIGHT_HAND_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../handTracking/sincroHandMotionSnapshot";
import { SincroGestureTracker } from "../sincroGestureTracker";
import type { SincroGestureRecognizerLike } from "../sincroGestureTrackerHelpers";

describe("SincroGestureTracker", () => {
    it("selects deterministic top labels, clamps confidence, and warns on handedness mismatch", () => {
        const tracker = new SincroGestureTracker({
            gestureRecognizer: createRecognizerResult({
                gestures: [
                    [
                        category("Open_Palm", 0.8),
                        category("Closed_Fist", 0.8),
                        category("Victory", 0.2),
                    ],
                    [category("Thumb_Up", 1.4)],
                ],
                handedness: [[category("Right", 0.9)], [category("Right", 0.9)]],
            }),
        });

        const snapshot = tracker.detect(createVideoFrame(), createHandSnapshot(), 120);

        expect(snapshot).toMatchObject({
            trackingEnabled: true,
            source: "gesture-recognizer",
            lastUpdatedAtMs: 120,
        });
        expect(snapshot.inferenceTimeMs).toBeGreaterThanOrEqual(0);
        expect(snapshot.left).toMatchObject({
            label: "Closed_Fist",
            confidence: 0.8,
            handedness: "right",
            source: "gesture-recognizer",
            warnings: ["handedness_mismatch"],
        });
        expect(snapshot.right).toMatchObject({
            label: "Thumb_Up",
            confidence: 1,
            handedness: "right",
            source: "gesture-recognizer",
            warnings: [],
        });
    });

    it("keeps unknown raw labels as explanation without inventing semantic intent labels", () => {
        const tracker = new SincroGestureTracker({
            gestureRecognizer: createRecognizerResult({
                gestures: [[category("ILoveYou", 0.95)]],
                handedness: [[category("Left", 0.9)]],
            }),
        });

        const snapshot = tracker.detect(
            createVideoFrame(),
            createHandSnapshot({ right: false }),
            240,
        );

        expect(snapshot.left).toMatchObject({
            label: "ILoveYou",
            confidence: 0.95,
            source: "gesture-recognizer",
        });
    });

    it("falls back to lost side snapshots when categories are empty or non-finite", () => {
        const tracker = new SincroGestureTracker({
            gestureRecognizer: createRecognizerResult({
                gestures: [[], [category("Victory", Number.NaN)]],
                handedness: [[category("Left", 0.9)], [category("Right", 0.9)]],
            }),
        });

        const snapshot = tracker.detect(createVideoFrame(), createHandSnapshot(), 360);

        expect(snapshot.source).toBe("lost");
        expect(snapshot.left).toMatchObject({
            source: "lost",
            confidence: 0,
            warnings: ["categories_missing"],
        });
        expect(snapshot.right).toMatchObject({
            source: "lost",
            confidence: 0,
            warnings: ["categories_missing"],
        });
    });

    it("returns a lost snapshot when the model is not loaded or inference throws", () => {
        const unloaded = new SincroGestureTracker();
        expect(unloaded.detect(createVideoFrame(), createHandSnapshot(), 480)).toMatchObject({
            source: "lost",
            fallbackReason: "GestureRecognizer model is not loaded.",
            warnings: ["gesture_skipped", "model_not_loaded"],
        });

        const failing = new SincroGestureTracker({
            gestureRecognizer: {
                recognizeForVideo: () => {
                    throw new Error("gesture inference failed");
                },
                close: () => {},
            },
        });
        expect(failing.detect(createVideoFrame(), createHandSnapshot(), 600)).toMatchObject({
            source: "lost",
            fallbackReason: "gesture inference failed",
            warnings: ["gesture_skipped", "inference_failed"],
        });
    });

    it("does not run recognition when the Hand snapshot is unavailable", () => {
        const tracker = new SincroGestureTracker({
            gestureRecognizer: createRecognizerResult({
                gestures: [[category("Open_Palm", 1)]],
                handedness: [[category("Left", 1)]],
            }),
        });

        const snapshot = tracker.detect(
            createVideoFrame(),
            DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
            720,
        );

        expect(snapshot).toMatchObject({
            source: "lost",
            fallbackReason: "gesture_tracking_requires_detected_hand",
            warnings: ["gesture_skipped", "no_hand_detected"],
        });
    });
});

function createRecognizerResult(input: {
    gestures: Category[][];
    handedness: Category[][];
}): SincroGestureRecognizerLike {
    const result: GestureRecognizerResult = {
        landmarks: [],
        worldLandmarks: [],
        handedness: input.handedness,
        handednesses: input.handedness,
        gestures: input.gestures,
    };
    return {
        recognizeForVideo: () => result,
        close: () => {},
    };
}

function category(categoryName: string, score: number): Category {
    return {
        categoryName,
        score,
        index: 0,
        displayName: "",
    };
}

function createHandSnapshot(
    input: { left?: boolean; right?: boolean } = {},
): SincroHandMotionSnapshot {
    const leftDetected = input.left ?? true;
    const rightDetected = input.right ?? true;
    return {
        ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: leftDetected || rightDetected,
        leftHand: {
            ...DEFAULT_SINCRO_LEFT_HAND_SNAPSHOT,
            detected: leftDetected,
            confidence: leftDetected ? 0.9 : 0,
        },
        rightHand: {
            ...DEFAULT_SINCRO_RIGHT_HAND_SNAPSHOT,
            detected: rightDetected,
            confidence: rightDetected ? 0.9 : 0,
        },
    };
}

function createVideoFrame(): TexImageSource {
    return Object.create(null);
}
