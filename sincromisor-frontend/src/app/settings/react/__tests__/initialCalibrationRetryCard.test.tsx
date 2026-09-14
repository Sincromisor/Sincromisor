import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
    InitialCalibrationStepId,
    InitialCalibrationStepResult,
} from "../../../../character/calibration/initialSincroCalibration";
import {
    InitialSincroCalibrationController,
    type InitialSincroCalibrationControllerState,
} from "../../../../character/calibration/initialSincroCalibrationController";
import { InitialCalibrationRetryCard } from "../components/initialCalibrationRetryCard";

function result(
    id: InitialCalibrationStepId,
    status: InitialCalibrationStepResult["status"] = "ready",
): InitialCalibrationStepResult {
    return {
        id,
        status,
        validDurationMs: 1000,
        score: status === "ready" ? 1 : 0.5,
        retryReasons: status === "ready" ? [] : ["hand_not_visible"],
        measurements: {},
        debug: {},
    };
}

function readyWithoutHandsState(): InitialSincroCalibrationControllerState {
    const controller = new InitialSincroCalibrationController();
    controller.dispatch({ type: "start", sessionId: "session-a", mediaTimeMs: 0 });
    for (const step of [
        result("precheck"),
        result("neutral"),
        result("a_pose"),
        result("hand_open", "retry"),
    ]) {
        controller.dispatch({ type: "record", sessionId: "session-a", result: step });
    }
    return controller.getState();
}

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

describe("InitialCalibrationRetryCard", () => {
    it("shows current status and dispatches retry for ready_without_hands", () => {
        const state = readyWithoutHandsState();
        const onRetry = vi.fn();
        const view = <InitialCalibrationRetryCard state={state} onRetry={onRetry} />;
        const markup = renderToStaticMarkup(view);

        expect(markup).toContain("ready_without_hands");
        expect(markup).toContain("手を開く");
        expect(markup).toContain("再試行");
        findButtonClick(InitialCalibrationRetryCard({ state, onRetry }))?.();
        expect(onRetry).toHaveBeenCalledWith("hand_open");
    });

    it("hides session fields and action for cancelled state", () => {
        const markup = renderToStaticMarkup(
            <InitialCalibrationRetryCard
                state={{ status: "cancelled", reason: "camera_stop", previousSessionId: "old" }}
                onRetry={vi.fn()}
            />,
        );
        expect(markup).toBe("");
    });
});
