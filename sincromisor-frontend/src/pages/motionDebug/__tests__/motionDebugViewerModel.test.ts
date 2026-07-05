import { describe, expect, it } from "vitest";
import { calculateMotionMetricSummary } from "../../../character/motionEvaluation/motionMetrics";
import { MotionReplayPlayer } from "../../../character/motionEvaluation/motionReplayPlayer";
import { MotionDebugApp } from "../motionDebugApp";
import { createMotionDebugViewerSnapshot } from "../motionDebugViewerModel";
import type { MotionDebugSnapshot } from "../types";
import { createLiveSnapshot, createMinimalLogText } from "./motionDebugViewerTestFixtures";

describe("createMotionDebugViewerSnapshot app API", () => {
    it("projects minimal replay log state and calculated metrics into viewer fields", () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        expect(player.loadRecordingText(createMinimalLogText()).ok).toBe(true);
        expect(player.startReplay({ mode: "pose-snapshot" }).ok).toBe(true);
        const summary = calculateMotionMetricSummary(player.replayFrames(), {
            generatedAtIso: "2026-06-23T12:01:00.000Z",
            thresholdVersion: "initial-v1",
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "metrics",
            selectedLayer: "metrics",
            liveSnapshot,
            replayState: player.getReplayState(),
            replayManifest: player.replayManifest(),
            replayFrame: player.replayFrame(),
            metrics: summary,
        });

        expect(viewer.replay).toMatchObject({
            status: "paused",
            mode: "pose-snapshot",
            frameCount: 2,
            currentFrameIndex: 0,
        });
        expect(viewer.layers.metrics.status).toBe("available");
        expect(viewer.layers.camera.status).toBe("available");
        expect(viewer.layers.canonical.status).toBe("not_implemented");
        expect(viewer.metrics?.metrics.elbowFlipCount.key).toBe("elbowFlipCount");
        expect(viewer.metrics?.metrics.neutralJitter.status).toBe("not_available");
    });

    it("runs QA regression from the motion-debug replay API surface", async () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        const logText = createMinimalLogText();
        expect(player.loadRecordingText(logText).ok).toBe(true);

        const app = Object.create(MotionDebugApp.prototype);
        Object.defineProperty(app, "replay", { value: player });
        Object.defineProperty(app, "setAutoViewerMode", { value: () => undefined });
        Object.defineProperty(app, "renderSnapshot", { value: () => undefined });

        const result = await MotionDebugApp.prototype.runQaRegression.call(app, {
            generatedAtIso: "2026-06-23T12:03:00.000Z",
            thresholdVersion: "initial-v1",
            fixtureId: "neutral-10s",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.result).toMatchObject({
            overall: "warn",
            fixtures: [
                {
                    fixtureId: "neutral-10s",
                    status: "warn",
                    summary: {
                        severity: "warn",
                    },
                },
            ],
        });
    });

    it("analyzes optimization candidates from the loaded recording API surface", async () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        expect(player.loadRecordingText(createMinimalLogText()).ok).toBe(true);

        const app = Object.create(MotionDebugApp.prototype);
        Object.defineProperty(app, "replay", { value: player });
        Object.defineProperty(app, "setAutoViewerMode", { value: () => undefined });
        Object.defineProperty(app, "renderSnapshot", { value: () => undefined });

        const result = await MotionDebugApp.prototype.analyzeOptimizationCandidates.call(app, {
            generatedAtIso: "2026-06-23T12:04:00.000Z",
            thresholdVersion: "initial-v1",
            fixtureId: "neutral-10s",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.report).toMatchObject({
            schemaVersion: "sincro.motion-optimization-candidates.v1",
            sourceQaOverall: "warn",
            candidates: [
                {
                    candidateId: "neutral-10s:do_not_optimize:0",
                    fixtureId: "neutral-10s",
                    target: "do_not_optimize",
                    requiresHumanLabel: false,
                },
            ],
        });
    });

    it("keeps fixture_id_required for candidate analysis when the loaded source is not a P0 fixture", async () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        expect(player.loadRecordingText(createMinimalLogText()).ok).toBe(true);

        const app = Object.create(MotionDebugApp.prototype);
        Object.defineProperty(app, "replay", { value: player });

        const result = await MotionDebugApp.prototype.analyzeOptimizationCandidates.call(app, {
            generatedAtIso: "2026-06-23T12:05:00.000Z",
            thresholdVersion: "initial-v1",
        });

        expect(result).toMatchObject({
            ok: false,
            code: "fixture_id_required",
        });
    });
});
