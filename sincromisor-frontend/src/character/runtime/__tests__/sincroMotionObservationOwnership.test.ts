import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT } from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import { toGestureIntentObservation } from "../../../features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import { DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT } from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import { DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { SincroMotionObserveOnlyPipeline } from "../sincroMotionObserveOnlyPipeline";
import * as pipelineState from "../sincroMotionPipelineState";

function createObservations(time: number) {
    const face = structuredClone(DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT);
    face.detected = true;
    face.headPose.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    face.lastUpdatedAtMs = time;
    const pose = structuredClone(DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT);
    pose.detected = true;
    pose.confidence = 0.8;
    pose.lastUpdatedAtMs = time;
    const hand = structuredClone(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT);
    hand.leftHand.warnings = ["roi_inconsistent"];
    hand.lastUpdatedAtMs = time;
    const gesture = {
        trackingEnabled: true,
        source: "gesture-recognizer" as const,
        left: {
            label: "Open_Palm",
            confidence: 0.91,
            handedness: "left" as const,
            source: "gesture-recognizer" as const,
            warnings: [],
        },
        warnings: [],
        inferenceTimeMs: 4,
        inferenceFps: 3,
        lastUpdatedAtMs: time,
    };
    return {
        face,
        pose,
        hand,
        gesture,
        input: {
            mediaTimeMs: time,
            receivedAtMs: time,
            video: { width: 640, height: 480 },
            hand,
            gesture: toGestureIntentObservation(gesture),
        },
    };
}

function update(
    pipeline: SincroMotionObserveOnlyPipeline,
    frame: ReturnType<typeof createObservations>,
) {
    return [
        pipeline.updateFace(frame.face, frame.input),
        pipeline.updatePose(frame.pose, frame.input),
        pipeline.updateHand(frame.hand, frame.input),
        pipeline.updateGesture(frame.gesture, frame.input),
    ];
}

// 型でreadonlyの配列も含め、利用側による実行時の破壊から内部状態が守られることを調べる。
function overwriteNestedValues(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
        if (typeof child === "object" && child !== null) overwriteNestedValues(child);
        else if (typeof child === "number") Reflect.set(value, key, 999);
        else if (typeof child === "string") Reflect.set(value, key, "changed");
        else if (typeof child === "boolean") Reflect.set(value, key, !child);
    }
    if (Array.isArray(value)) value.push("changed");
}

function freezeNested(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const child of Object.values(value)) freezeNested(child);
    Object.freeze(value);
}

describe("観測状態の所有権と複製回数", () => {
    it("状態全体は各更新の返却時だけ複製し、要約取得では複製しない", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();
        update(pipeline, createObservations(100));
        const clone = vi.spyOn(pipelineState, "cloneSincroMotionPipelineState");
        try {
            update(pipeline, createObservations(140));
            expect(clone).toHaveBeenCalledTimes(4);
            clone.mockClear();
            pipeline.getSummary();
            expect(clone).not.toHaveBeenCalled();
        } finally {
            clone.mockRestore();
        }
    });

    it("入力・公開状態・要約を書き換えても内部状態と次の推定へ波及しない", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();
        const control = new SincroMotionObserveOnlyPipeline();
        const input = createObservations(100);
        const results = update(pipeline, input);
        update(control, createObservations(100));
        overwriteNestedValues(input);
        overwriteNestedValues(results);
        overwriteNestedValues(pipeline.getState());
        overwriteNestedValues(pipeline.getSummary());
        expect(pipeline.getState()).toEqual(control.getState());
        expect(pipeline.getSummary()).toEqual(control.getSummary());
        expect(update(pipeline, createObservations(140))).toEqual(
            update(control, createObservations(140)),
        );
    });

    it("凍結した入力を変更せず、後続の観測や初期化で過去の返却値を変更しない", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();
        const input = createObservations(100);
        freezeNested(input);
        const results = update(pipeline, input);
        const saved = structuredClone(results);
        update(pipeline, createObservations(140));
        update(pipeline, createObservations(180));
        pipeline.reset();
        expect(results).toEqual(saved);
    });
});
