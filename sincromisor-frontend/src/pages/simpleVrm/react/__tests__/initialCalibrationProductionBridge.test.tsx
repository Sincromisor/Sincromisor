import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { InitialSincroCalibrationController } from "../../../../character/calibration/initialSincroCalibrationController";
import { InitialSincroCalibrationPoseBridge } from "../../../../character/calibration/initialSincroCalibrationPoseBridge";
import { createDefaultReliabilityMap } from "../../../../character/reliability/reliabilityMap";
import { InitialCalibrationRetryCard } from "../components/initialCalibrationRetryCard";
import { cancelActiveCalibration } from "../useSimpleVrmPanelState";

function findButtonClick(node: ReactNode): (() => void) | undefined {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) {
        return undefined;
    }
    if (node.type === "button") {
        return node.props.onClick;
    }
    for (const child of Children.toArray(node.props.children)) {
        const click = findButtonClick(child);
        if (click !== undefined) {
            return click;
        }
    }
    return undefined;
}

describe("initial calibration production bridge", () => {
    it("records evaluator result, publishes guide, and remeasures the clicked step", () => {
        const controller = new InitialSincroCalibrationController();
        const bridge = new InitialSincroCalibrationPoseBridge(controller);
        const observedStates: string[] = [];
        controller.subscribe((state) => observedStates.push(state.status));
        controller.dispatch({ type: "start", sessionId: "session-a", mediaTimeMs: 0 });

        expect(
            bridge.record({ reliability: createDefaultReliabilityMap(0), mediaTimeMs: 0 })?.ok,
        ).toBe(true);
        const recorded = controller.getState();
        expect(recorded).toMatchObject({
            status: "active",
            currentStep: "precheck",
            session: { status: "retry_recommended" },
        });
        if (recorded.status !== "active") {
            return;
        }
        expect(recorded.session.userGuideMessages[0]).toBeDefined();
        const retry = vi.fn((stepId) =>
            controller.dispatch({ type: "retry", sessionId: recorded.sessionId, stepId }),
        );
        findButtonClick(InitialCalibrationRetryCard({ state: recorded, onRetry: retry }))?.();
        expect(retry).toHaveBeenCalledWith("precheck");
        expect(controller.getState()).toMatchObject({
            status: "active",
            currentStep: "precheck",
            session: { steps: {} },
        });

        expect(
            bridge.record({ reliability: createDefaultReliabilityMap(16), mediaTimeMs: 16 })?.ok,
        ).toBe(true);
        const remeasured = controller.getState();
        expect(
            remeasured.status === "active" ? remeasured.session.steps.precheck : undefined,
        ).toBeDefined();
        expect(observedStates).toContain("active");
    });

    it("cancels on VRM source change and rejects an old-session callback after restart", () => {
        const controller = new InitialSincroCalibrationController();
        controller.dispatch({ type: "start", sessionId: "session-a", mediaTimeMs: 0 });
        const oldResult = {
            id: "precheck" as const,
            status: "retry" as const,
            validDurationMs: 0,
            score: 0,
            retryReasons: ["camera_unavailable" as const],
            measurements: {},
            debug: {},
        };

        cancelActiveCalibration(controller, "vrm_source_changed");
        expect(controller.getState()).toEqual({
            status: "cancelled",
            reason: "vrm_source_changed",
            previousSessionId: "session-a",
        });
        controller.dispatch({ type: "start", sessionId: "session-b", mediaTimeMs: 100 });
        const active = controller.getState();
        expect(
            controller.dispatch({ type: "record", sessionId: "session-a", result: oldResult }),
        ).toEqual({
            ok: false,
            reason: "stale_session",
            state: active,
        });
    });
});
