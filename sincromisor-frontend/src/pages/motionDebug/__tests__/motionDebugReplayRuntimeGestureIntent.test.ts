import { describe, expect, it, vi } from "vitest";
import type { MotionReplayApplyContext } from "../../../character/motionEvaluation/motionReplayPlayer";
import { MotionIntentEstimator } from "../../../character/motionIntent/motionIntentEstimator";
import { createDefaultTemporalUpperBodyState } from "../../../character/temporal/temporalUpperBodyState";
import type { SincroGestureMotionSnapshot } from "../../../features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import {
    cloneSincroHandMotionSnapshot,
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import { MotionDebugReplayRuntime } from "../motionDebugReplayRuntime";

function createContext(mediaTimeMs: number, savedIntent?: unknown): MotionReplayApplyContext {
    return {
        frameIndex: mediaTimeMs === 0 ? 0 : 1,
        mediaTimeMs,
        frame: {
            frameIndex: mediaTimeMs === 0 ? 0 : 1,
            timestamp: { mediaTimeMs },
            video: { width: 1280, height: 720 },
            intent: savedIntent,
        },
    };
}

function createGesture(source: "gesture-recognizer" | "lost"): SincroGestureMotionSnapshot {
    return {
        trackingEnabled: true,
        source,
        left: {
            label: source === "gesture-recognizer" ? "Pointing_Up" : "",
            confidence: source === "gesture-recognizer" ? 0.95 : 0,
            source,
            warnings: source === "lost" ? ["gesture_skipped"] : [],
        },
        warnings: source === "lost" ? ["gesture_skipped"] : [],
        inferenceTimeMs: 0,
        inferenceFps: 0,
    };
}

function createIntentRuntime(): MotionDebugReplayRuntime {
    const runtime: MotionDebugReplayRuntime = Object.create(MotionDebugReplayRuntime.prototype);
    const temporal = createDefaultTemporalUpperBodyState(0);
    temporal.arms.left.state = "tracked";
    temporal.arms.left.source = "canonical";
    temporal.arms.left.confidence = 0.9;
    temporal.arms.left.warnings = [];
    const hand = cloneSincroHandMotionSnapshot(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT);
    hand.trackingEnabled = true;
    hand.detected = true;
    hand.leftHand.detected = true;
    hand.leftHand.source = "full-frame-fallback";
    hand.leftHand.confidence = 0.9;
    hand.leftHand.warnings = [];
    Object.defineProperties(runtime, {
        intentEstimator: { value: new MotionIntentEstimator() },
        latestTemporal: { value: temporal, writable: true },
        latestIntent: { value: undefined, writable: true },
        params: {
            value: {
                tracker: {
                    latestValidReliability: () => undefined,
                    snapshotState: () => ({ hand }),
                },
            },
        },
    });
    return runtime;
}

function readDerivedIntent(runtime: MotionDebugReplayRuntime) {
    const intent = runtime.snapshotState().intent;
    if (intent === undefined || "parseStatus" in intent) {
        throw new Error("Expected replay-derived intent state.");
    }
    return intent;
}

describe("MotionDebugReplayRuntime raw gesture intent", () => {
    it("feeds the normalized gesture observation into replay-derived intent", () => {
        const runtime = createIntentRuntime();
        const gesture = createGesture("gesture-recognizer");

        // biome-ignore lint/complexity/useLiteralKeys: replay-derived private boundaryを公開API化せず検証する。
        runtime["updateReplayIntent"](createContext(0), gesture);
        // biome-ignore lint/complexity/useLiteralKeys: replay-derived private boundaryを公開API化せず検証する。
        runtime["updateReplayIntent"](createContext(250), gesture);

        expect(readDerivedIntent(runtime).arms.left).toMatchObject({
            intent: "pointing",
            sourceGestureLabel: "Pointing_Up",
        });
    });

    it("treats missing and lost gesture equally without saved-intent completion", () => {
        const missing = createIntentRuntime();
        const lost = createIntentRuntime();
        const savedIntent = { arms: { left: { intent: "thumbsUp" } } };

        // biome-ignore lint/complexity/useLiteralKeys: replay-derived private boundaryを公開API化せず検証する。
        missing["updateReplayIntent"](createContext(0, savedIntent), undefined);
        // biome-ignore lint/complexity/useLiteralKeys: replay-derived private boundaryを公開API化せず検証する。
        lost["updateReplayIntent"](createContext(0, savedIntent), createGesture("lost"));

        expect(lost.snapshotState().intent).toEqual(missing.snapshotState().intent);
        expect(readDerivedIntent(missing).arms.left.sourceGestureLabel).toBeUndefined();
        expect(readDerivedIntent(missing).arms.left.intent).not.toBe("thumbsUp");
    });

    it("resets before non-contiguous seek but preserves an adjacent forward step", () => {
        const runtime: MotionDebugReplayRuntime = Object.create(MotionDebugReplayRuntime.prototype);
        let currentFrameIndex = 2;
        const reset = vi.fn();
        Object.defineProperties(runtime, {
            player: {
                value: {
                    getReplayState: () => ({ currentFrameIndex }),
                    stepReplay: (frameIndex: number) => {
                        currentFrameIndex = frameIndex;
                        return { ok: false, code: "frame_index_out_of_range", message: "test" };
                    },
                },
            },
            timer: {
                value: { clear: vi.fn(), updateReplayStatus: vi.fn() },
            },
            params: { value: { renderSnapshot: vi.fn() } },
            resetTemporalState: { value: reset },
        });

        runtime.stepReplay(3);
        expect(reset).not.toHaveBeenCalled();
        runtime.stepReplay(1);
        expect(reset).toHaveBeenCalledOnce();
    });
});
