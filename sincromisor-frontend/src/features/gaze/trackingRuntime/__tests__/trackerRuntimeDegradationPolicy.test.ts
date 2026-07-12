import { describe, expect, it } from "vitest";

import {
    TrackerRuntimeDegradationPolicyController,
    type TrackerRuntimeDegradationPolicyDecision,
    type TrackerRuntimeDegradationStage,
} from "../trackerRuntimeDegradationPolicy";
import {
    resolveTrackerRuntimePerformanceProfile,
    type TrackerRuntimePerformanceProfile,
} from "../trackerRuntimePerformanceProfile";

describe("TrackerRuntimeDegradationPolicyController", () => {
    it("degrades in the fixed order by one stage per over-budget threshold", () => {
        const controller = new TrackerRuntimeDegradationPolicyController();
        const profile = createProfile();
        const stages: TrackerRuntimeDegradationStage[] = [];

        for (let index = 0; index < 6; index += 1) {
            const decision = advanceOverBudget(controller, profile);
            stages.push(decision.state.stage);
            expect(decision.state.consecutiveOverBudgetFrames).toBe(0);
            expect(decision.state.consecutiveWithinBudgetFrames).toBe(0);
        }

        expect(stages).toEqual([
            "gesture-reduced-fps",
            "optional-pass-reduced-fps",
            "roi-hand-paused",
            "pose-reduced-fps",
            "face-only",
            "comfortable-idle",
        ]);
    });

    it("uses ROI over-budget threshold without skipping stages", () => {
        const controller = new TrackerRuntimeDegradationPolicyController();
        const profile = createProfile();

        const first = controller.update({
            mediaTimeMs: 100,
            profile,
            roi: {
                pauseState: "active",
                consecutiveOverBudgetFrames: profile.degradationBudget.consecutiveOverBudgetFrames,
                reasonCodes: ["roi_inference_over_budget"],
            },
        });
        const second = controller.update({
            mediaTimeMs: 116,
            profile,
            roi: {
                pauseState: "active",
                consecutiveOverBudgetFrames: profile.degradationBudget.consecutiveOverBudgetFrames,
                reasonCodes: ["roi_inference_over_budget"],
            },
        });

        expect(first.state.stage).toBe("full");
        expect(first.state.consecutiveOverBudgetFrames).toBe(1);
        expect(second.state.stage).toBe("gesture-reduced-fps");
        expect(second.reasonCodes).toContain("roi_inference_over_budget");
    });

    it("does not change counters when budget status is unknown", () => {
        const controller = new TrackerRuntimeDegradationPolicyController();
        const profile = createProfile();

        controller.update({ mediaTimeMs: 100, profile });
        controller.update({ mediaTimeMs: 116, profile, budgetStatus: "warn" });

        expect(controller.getState()).toMatchObject({
            stage: "full",
            consecutiveOverBudgetFrames: 0,
            consecutiveWithinBudgetFrames: 0,
        });
    });

    it("does not recover on ok budget status when ROI input is missing", () => {
        const controller = new TrackerRuntimeDegradationPolicyController();
        const profile = createProfile();
        advanceOverBudget(controller, profile);
        expect(controller.getState().stage).toBe("gesture-reduced-fps");

        const decision = controller.update({
            mediaTimeMs: 200,
            profile,
            budgetStatus: "ok",
            poseDetected: true,
            poseInferenceTimeMs: 1,
        });

        expect(decision.state).toMatchObject({
            stage: "gesture-reduced-fps",
            consecutiveOverBudgetFrames: 0,
            consecutiveWithinBudgetFrames: 0,
        });
    });

    it("recovers in reverse order and gates face-only recovery on healthy pose", () => {
        const controller = new TrackerRuntimeDegradationPolicyController();
        const profile = createProfile();
        for (let index = 0; index < 5; index += 1) {
            advanceOverBudget(controller, profile);
        }
        expect(controller.getState().stage).toBe("face-only");

        const blocked = advanceWithinBudget(controller, profile, {
            poseDetected: false,
            poseInferenceTimeMs: 1,
        });
        expect(blocked.state.stage).toBe("face-only");
        expect(blocked.state.recovering).toBe(true);

        const recovered = advanceWithinBudget(controller, profile, {
            poseDetected: true,
            poseInferenceTimeMs: 20,
        });
        expect(recovered.state.stage).toBe("pose-reduced-fps");
        expect(recovered.state.consecutiveWithinBudgetFrames).toBe(0);

        const next = advanceWithinBudget(controller, profile, {
            poseDetected: true,
            poseInferenceTimeMs: 20,
        });
        expect(next.state.stage).toBe("roi-hand-paused");
    });

    it("clamps effective cadence while keeping main-thread-low-fps compatibility", () => {
        const controller = new TrackerRuntimeDegradationPolicyController();
        const profile = createProfile();
        advanceOverBudget(controller, profile);
        advanceOverBudget(controller, profile);
        advanceOverBudget(controller, profile);
        advanceOverBudget(controller, profile);

        const decision = controller.update({
            mediaTimeMs: 200,
            profile,
            budgetStatus: "ok",
            roi: { pauseState: "active", consecutiveOverBudgetFrames: 0, reasonCodes: [] },
            mainThreadFallbackActive: true,
        });

        expect(decision.trackerDegradationState).toBe("main-thread-low-fps");
        expect(decision.effectiveCadence).toMatchObject({
            faceFps: 8,
            poseFps: 4,
            handFps: 2,
            faceRoiFps: 3,
        });
    });

    it("keeps reduced fps and ROI stages but suppresses face-only fallback when ignored", () => {
        const controller = new TrackerRuntimeDegradationPolicyController();
        const profile = createProfile();

        for (let index = 0; index < 6; index += 1) {
            advanceOverBudget(controller, profile, true);
        }

        const decision = controller.update({
            mediaTimeMs: 300,
            profile,
            budgetStatus: "over_budget",
            ignorePerformanceFallback: true,
        });

        expect(decision.state.stage).toBe("pose-reduced-fps");
        expect(decision.shouldDegradeToFaceOnly).toBe(false);
        expect(decision.effectiveCadence).toMatchObject({
            poseFps: 6,
            handFps: 4,
            faceRoiFps: 5,
            gestureFps: 3,
        });
    });
});

function createProfile(): TrackerRuntimePerformanceProfile {
    const base = resolveTrackerRuntimePerformanceProfile({
        performanceProfileId: "high-end-desktop",
    }).profile;
    return {
        ...base,
        degradationBudget: {
            ...base.degradationBudget,
            consecutiveOverBudgetFrames: 2,
            recoveryFrames: 2,
        },
    };
}

function advanceOverBudget(
    controller: TrackerRuntimeDegradationPolicyController,
    profile: TrackerRuntimePerformanceProfile,
    ignorePerformanceFallback = false,
): TrackerRuntimeDegradationPolicyDecision {
    let decision = controller.update({
        mediaTimeMs: 100,
        profile,
        budgetStatus: "over_budget",
        budgetReasonCodes: ["worker_round_trip_over_budget"],
        ignorePerformanceFallback,
    });
    decision = controller.update({
        mediaTimeMs: 116,
        profile,
        budgetStatus: "over_budget",
        budgetReasonCodes: ["worker_round_trip_over_budget"],
        ignorePerformanceFallback,
    });
    return decision;
}

function advanceWithinBudget(
    controller: TrackerRuntimeDegradationPolicyController,
    profile: TrackerRuntimePerformanceProfile,
    pose: { poseDetected: boolean; poseInferenceTimeMs: number },
): TrackerRuntimeDegradationPolicyDecision {
    let decision = controller.update({
        mediaTimeMs: 200,
        profile,
        budgetStatus: "ok",
        roi: { pauseState: "active", consecutiveOverBudgetFrames: 0, reasonCodes: [] },
        poseDetected: pose.poseDetected,
        poseInferenceTimeMs: pose.poseInferenceTimeMs,
    });
    decision = controller.update({
        mediaTimeMs: 216,
        profile,
        budgetStatus: "ok",
        roi: { pauseState: "active", consecutiveOverBudgetFrames: 0, reasonCodes: [] },
        poseDetected: pose.poseDetected,
        poseInferenceTimeMs: pose.poseInferenceTimeMs,
    });
    return decision;
}
