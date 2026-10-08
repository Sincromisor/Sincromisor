import { afterEach, expect, it, vi } from "vitest";
import { CharacterBehaviorState } from "../../../character/behavior/characterBehaviorState";
import type { SincroMotionDebugFrame } from "../../../character/motionEvaluation/motionDebugLogSchema";
import { createDefaultMotionIntentState } from "../../../character/motionIntent/motionIntentState";
import { createDefaultReliabilityMap } from "../../../character/reliability/reliabilityMap";
import {
    computeSincroCanonicalMotion,
    SincroMotionComputation,
} from "../../../character/runtime/sincroMotionComputation";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { MotionDebugReplayRuntime } from "../motionDebugReplayRuntime";
import type { MotionDebugSceneRuntime } from "../motionDebugSceneRuntime";
import { MotionDebugTrackerBridge } from "../motionDebugTrackerBridge";
import type { MotionDebugPoseOverlayRenderer } from "../poseOverlayRenderer";
import {
    createCanonicalState,
    createLiveSnapshot,
    createManifest,
    createPoseSnapshot,
    createTemporalState,
} from "./motionDebugViewerTestFixtures";

afterEach(() => vi.restoreAllMocks());

/** MediaPipe・カメラ・描画の資源境界だけを差し替え、再生と保存値解決は実装を通す。 */
function createRuntime() {
    const behaviorState = CharacterBehaviorState.getManager();
    const debugConsole = DebugConsoleManager.getManager();
    const tracker = new MotionDebugTrackerBridge({
        video: { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement,
        camera: undefined as never,
        recording: undefined as never,
        behaviorState,
        debugConsole,
        overlayRenderer: { render() {} } as unknown as MotionDebugPoseOverlayRenderer,
        getAvatarMotionProfile: () => undefined,
        onLiveFrame() {},
        onError: (error) => {
            throw error;
        },
    });
    const runtime = new MotionDebugReplayRuntime({
        tracker,
        behaviorState,
        debugConsole,
        scene: { renderOnce() {} } as unknown as MotionDebugSceneRuntime,
        getSnapshot: () => ({
            ...createLiveSnapshot(),
            ...tracker.snapshotState(),
            ...runtime.snapshotState(),
        }),
        setStatus() {},
        setAutoViewerMode() {},
        renderSnapshot() {},
        stopActiveRuntime() {
            runtime.resetCanonicalState();
            tracker.resetReliabilityState();
            runtime.resetTemporalState();
        },
    });
    return { runtime, tracker };
}

function frame(index: number): SincroMotionDebugFrame {
    const mediaTimeMs = 100 + index * 125;
    return {
        frameIndex: index,
        timestamp: { mediaTimeMs },
        video: { width: 1280, height: 720 },
        poseSnapshot: createPoseSnapshot(mediaTimeMs),
    };
}

function log(frames: SincroMotionDebugFrame[]): string {
    return [
        JSON.stringify({ recordType: "manifest", manifest: createManifest() }),
        ...frames.map((frame) => JSON.stringify({ recordType: "frame", frame })),
    ].join("\n");
}

it("保存値・欠損・無効値を分け、共通計算で保存表示を上書きしない", async () => {
    const { runtime, tracker } = createRuntime();
    const savedIntent = createDefaultMotionIntentState(100);
    const saved = {
        ...frame(0),
        canonical: createCanonicalState(100),
        temporal: createTemporalState(100),
        reliability: createDefaultReliabilityMap(100),
        intent: savedIntent,
    };
    const missing = frame(1);
    const invalid = {
        ...frame(2),
        reliability: { broken: "reliability" },
        canonical: { broken: "canonical" },
        temporal: { broken: "temporal" },
        postProcessing: { broken: "postProcessing" },
    };
    const canonicalInvalidOnly = { ...frame(3), canonical: { broken: "canonical" } };
    expect(
        (await runtime.loadRecording(log([saved, missing, invalid, canonicalInvalidOnly]))).ok,
    ).toBe(true);
    expect(runtime.startReplay({ mode: "pose-snapshot" }).ok).toBe(true);
    expect(runtime.snapshotState()).toMatchObject({
        canonical: saved.canonical,
        temporal: saved.temporal,
    });
    expect(tracker.snapshotState().reliability).toEqual(saved.reliability);
    const computation = new SincroMotionComputation();
    const intent = computation.updateIntent({
        temporal: saved.temporal,
        reliability: saved.reliability,
        mediaTimeMs: 100,
    });
    expect(runtime.snapshotState().intent).toEqual(intent);
    expect(runtime.replayFrames()[0]?.intent).toEqual(savedIntent);
    expect(runtime.snapshotState().postProcessing).toBeUndefined();

    expect(runtime.stepReplay(1).ok).toBe(true);
    const canonical = computeSincroCanonicalMotion({
        pose: createPoseSnapshot(225),
        face: tracker.snapshotState().face,
        previous: saved.canonical,
        mediaTimeMs: 225,
        reliability: tracker.latestValidReliability(),
    });
    const computed = computation.update({
        canonical,
        reliability: tracker.latestValidReliability(),
        mediaTimeMs: 225,
    });
    expect(runtime.snapshotState()).toMatchObject({ canonical, ...computed });
    expect(runtime.replayFrames()[1]).not.toHaveProperty("temporal");
    expect(runtime.replayFrames()[1]).not.toHaveProperty("intent");

    expect(runtime.stepReplay(2).ok).toBe(true);
    expect(runtime.snapshotState()).toMatchObject({
        canonical: { parseStatus: "invalid", raw: invalid.canonical },
        temporal: { parseStatus: "invalid", raw: invalid.temporal },
        postProcessing: { parseStatus: "invalid", raw: invalid.postProcessing },
    });
    expect(tracker.snapshotState().reliability).toMatchObject({
        parseStatus: "invalid",
        raw: invalid.reliability,
    });
    expect(runtime.snapshotState().intent).toBeUndefined();
    expect(runtime.stepReplay(3).ok).toBe(true);
    expect(runtime.snapshotState().temporal).toBeUndefined();
    expect(runtime.snapshotState().intent).toBeUndefined();
});

it("隣接前進だけ推定を継続し、移動・停止・読込では再生側の状態を初期化する", async () => {
    const { runtime } = createRuntime();
    const independent = new SincroMotionComputation();
    const otherState = independent.update({ canonical: createCanonicalState(50), mediaTimeMs: 50 });
    const reset = vi.spyOn(SincroMotionComputation.prototype, "reset");
    const text = log([frame(0), frame(1), frame(2)]);
    expect((await runtime.loadRecording(text)).ok).toBe(true);
    runtime.startReplay({ mode: "pose-snapshot" });
    reset.mockClear();
    expect(runtime.stepReplay(1).ok).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    for (const index of [1, 0, 2]) {
        reset.mockClear();
        expect(runtime.stepReplay(index).ok).toBe(true);
        expect(reset).toHaveBeenCalledOnce();
        expect(runtime.snapshotState().intent).toHaveProperty(
            "warnings",
            expect.not.arrayContaining(["invalid_dt"]),
        );
    }
    reset.mockClear();
    runtime.stopReplay();
    expect(reset).toHaveBeenCalledOnce();
    expect(runtime.snapshotState().temporal).toBeUndefined();
    expect(runtime.snapshotState().intent).toBeUndefined();
    runtime.startReplay({ mode: "pose-snapshot" });
    expect(runtime.snapshotState().temporal).toBeDefined();
    await runtime.loadRecording(text);
    expect(runtime.snapshotState().temporal).toBeUndefined();
    expect(runtime.snapshotState().intent).toBeUndefined();
    // 別系列の履歴へ再生のresetが届かないことを、共通推定の実際の呼出先で確認する。
    expect(reset.mock.contexts).not.toContain(independent);
    expect(otherState.temporal.timestamp.mediaTimeMs).toBe(50);
});

it("再計算を明示した条件では保存された下流値を捨て、条件を再実行しても履歴を共有しない", async () => {
    const { runtime } = createRuntime();
    const saved = {
        ...frame(0),
        canonical: createCanonicalState(100),
        temporal: createTemporalState(100),
        reliability: createDefaultReliabilityMap(100),
    };
    saved.canonical.arms.left.reach = 1.1;
    saved.temporal.arms.left.reach = 1.1;
    await runtime.loadRecording(log([saved, frame(1)]));
    runtime.startReplay({ mode: "pose-snapshot", recompute: false });
    expect(runtime.snapshotState().temporal).toEqual(saved.temporal);
    runtime.startReplay({ mode: "pose-snapshot", recompute: true });
    const first = structuredClone(runtime.snapshotState());
    expect(first.temporal).not.toEqual(saved.temporal);
    runtime.stepReplay(1);
    runtime.startReplay({ mode: "pose-snapshot", recompute: true });
    expect(runtime.snapshotState()).toEqual(first);
});
