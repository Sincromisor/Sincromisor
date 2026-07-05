import { describe, expect, it } from "vitest";
import { calculateMotionMetricSummary } from "../../../character/motionEvaluation/motionMetrics";
import { TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION } from "../../../features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy";
import { TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION } from "../../../features/gaze/trackingRuntime/trackerRuntimePerformanceBudget";
import { createMotionDebugViewerSnapshot } from "../motionDebugViewerModel";
import { createLiveSnapshot } from "./motionDebugViewerTestFixtures";

describe("motion-debug viewer metrics layer", () => {
    it("projects Phase 10 degradation metric results into the metrics layer JSON", () => {
        const liveSnapshot = createLiveSnapshot();
        const summary = calculateMotionMetricSummary(
            [
                {
                    frameIndex: 0,
                    timestamp: {
                        mediaTimeMs: 0,
                        droppedPresentedFrames: 2,
                    },
                    video: {
                        width: 1280,
                        height: 720,
                    },
                    metrics: {
                        tracker: {
                            droppedFrames: 0,
                            budget: {
                                budgetStatus: "over_budget",
                                degradation: {
                                    state: "full",
                                },
                            },
                        },
                    },
                },
            ],
            {
                generatedAtIso: "2026-06-23T12:02:00.000Z",
                thresholdVersion: "initial-v1",
            },
        );

        const viewer = createMotionDebugViewerSnapshot({
            mode: "metrics",
            selectedLayer: "metrics",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
                currentFrameIndex: 0,
            },
            metrics: summary,
        });

        expect(viewer.layers.metrics.status).toBe("available");
        expect(viewer.layers.metrics.value).toMatchObject({
            metrics: {
                trackerBudgetOverrunFrameCount: {
                    value: 1,
                    severity: "warn",
                    threshold: { pass: 0, warn: 30, fail: 90 },
                },
                trackerDroppedFrameCount: {
                    value: 2,
                    severity: "warn",
                    threshold: { pass: 0, warn: 15, fail: 60 },
                },
                degradationStageFrameCount: {
                    value: 0,
                    severity: "pass",
                    threshold: { pass: 0, warn: 45, fail: 150 },
                },
                degradationRecoveryFrameCount: {
                    value: null,
                    severity: "warn",
                    unavailableReason:
                        "degradationRecoveryFrameCount requires frame.metrics.tracker.degradationPolicy.recovering.",
                },
                roiPausedFrameCount: {
                    value: null,
                    severity: "warn",
                    unavailableReason:
                        "roiPausedFrameCount requires frame.metrics.tracker.roi.pauseState.",
                },
            },
        });
    });
    it("shows replay tracker performance budget in the metrics layer JSON", () => {
        const liveSnapshot = createLiveSnapshot();
        const trackerBudget = {
            schemaVersion: TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION,
            target: {
                faceTargetFps: 15,
                poseTargetFps: 12,
                frameBudgetMs: 66.66666666666667,
                poseBudgetMs: 83.33333333333333,
            },
            observed: {
                clockSource: "request-video-frame-callback",
                workerRoundTripMs: 78,
                workerTimeMs: 61,
                droppedFrames: 1,
            },
            budgetStatus: "warn",
            degradation: {
                state: "full",
            },
            reasonCodes: ["worker_round_trip_warn", "worker_pending_frame_dropped"],
        };
        const roiStats = {
            pauseState: "hand-paused",
            fallbackCount: 2,
            skippedFrames: 4,
            consecutiveOverBudgetFrames: 0,
            reasonCodes: ["face_roi_skipped", "roi_fallback_full_frame", "hand_roi_paused"],
        };
        const degradationPolicy = {
            schemaVersion: TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION,
            stage: "roi-hand-paused",
            previousStage: "optional-pass-reduced-fps",
            reasonCodes: ["worker_round_trip_warn", "hand_roi_paused"],
            sinceMediaTimeMs: 220,
            effectiveCadence: {
                faceFps: 15,
                poseFps: 12,
                handFps: 4,
                faceRoiFps: 5,
                gestureFps: 3,
            },
            recovering: false,
        };

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "metrics",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                metrics: {
                    tracker: {
                        mode: "worker",
                        status: "running",
                        transferTimeMs: 3,
                        workerRoundTripMs: 78,
                        workerTimeMs: 61,
                        effectiveFaceRoiFps: 3,
                        loadTimeMs: 120,
                        droppedFrames: 1,
                        roi: roiStats,
                        budget: trackerBudget,
                        degradationPolicy,
                    },
                },
            },
        });

        expect(viewer.layers.metrics.status).toBe("available");
        expect(viewer.layers.metrics.value).toMatchObject({
            tracker: {
                roi: roiStats,
                degradationPolicy: {
                    schemaVersion: TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION,
                    stage: "roi-hand-paused",
                    reasonCodes: ["worker_round_trip_warn", "hand_roi_paused"],
                    effectiveCadence: {
                        handFps: 4,
                        faceRoiFps: 5,
                        gestureFps: 3,
                    },
                },
                effectiveFaceRoiFps: 3,
                budget: {
                    schemaVersion: TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION,
                    budgetStatus: "warn",
                },
            },
            activePerformanceProfile: {
                id: "debug",
            },
        });
        expect(viewer.metrics).toBeUndefined();
    });
});
