import { describe, expect, it } from "vitest";
import type {
    InitialCalibrationStepId,
    InitialCalibrationStepResult,
} from "../initialSincroCalibration";
import {
    InitialSincroCalibrationController,
    type InitialSincroCalibrationControllerState,
} from "../initialSincroCalibrationController";

function result(
    id: InitialCalibrationStepId,
    status: InitialCalibrationStepResult["status"] = "ready",
): InitialCalibrationStepResult {
    return {
        id,
        status,
        validDurationMs: 1000,
        score: status === "ready" ? 1 : 0.5,
        retryReasons: status === "ready" ? [] : ["low_reliability"],
        measurements: {},
        debug: {},
    };
}

function activeState(controller: InitialSincroCalibrationController) {
    const state = controller.getState();
    if (state.status !== "active") {
        throw new Error("Expected active calibration session.");
    }
    return state;
}

function record(
    controller: InitialSincroCalibrationController,
    stepId: InitialCalibrationStepId,
    status: InitialCalibrationStepResult["status"] = "ready",
): void {
    expect(
        controller.dispatch({
            type: "record",
            sessionId: "session-a",
            result: result(stepId, status),
        }).ok,
    ).toBe(true);
}

describe("InitialSincroCalibrationController", () => {
    it("keeps rejected operations non-mutating", () => {
        const controller = new InitialSincroCalibrationController();
        const idle = controller.getState();
        expect(
            controller.dispatch({ type: "cancel", sessionId: "old", reason: "camera_stop" }),
        ).toEqual({
            ok: false,
            reason: "inactive",
            state: idle,
        });
        expect(controller.getState()).toBe(idle);

        controller.dispatch({ type: "start", sessionId: "session-a", mediaTimeMs: 100 });
        const active = controller.getState();
        expect(
            controller.dispatch({ type: "start", sessionId: "session-b", mediaTimeMs: 200 }),
        ).toEqual({
            ok: false,
            reason: "already_active",
            state: active,
        });
        expect(
            controller.dispatch({ type: "record", sessionId: "old", result: result("precheck") }),
        ).toEqual({ ok: false, reason: "stale_session", state: active });
        expect(controller.getState()).toBe(active);
        expect(
            controller.dispatch({ type: "retry", sessionId: "session-a", stepId: "precheck" }),
        ).toEqual({
            ok: false,
            reason: "step_missing",
            state: active,
        });
        expect(controller.getState()).toBe(active);
    });

    it("applies the documented retry cascades including ready steps", () => {
        const scenarios: Array<[InitialCalibrationStepId, InitialCalibrationStepId[]]> = [
            ["precheck", []],
            ["neutral", ["precheck"]],
            ["a_pose", ["precheck", "neutral", "hand_open"]],
            ["hand_open", ["precheck", "neutral", "a_pose"]],
        ];
        for (const [stepId, remaining] of scenarios) {
            const controller = new InitialSincroCalibrationController();
            controller.dispatch({ type: "start", sessionId: "session-a", mediaTimeMs: 100 });
            for (const id of ["precheck", "neutral", "a_pose", "hand_open"] as const) {
                record(controller, id);
            }

            expect(controller.dispatch({ type: "retry", sessionId: "session-a", stepId }).ok).toBe(
                true,
            );
            const state = activeState(controller);
            expect(state.currentStep).toBe(stepId);
            expect(Object.keys(state.session.steps).sort()).toEqual([...remaining].sort());
        }
    });

    it("keeps ready_without_hands complete while allowing optional hand retry", () => {
        const controller = new InitialSincroCalibrationController();
        controller.dispatch({ type: "start", sessionId: "session-a", mediaTimeMs: 100 });
        record(controller, "precheck");
        record(controller, "neutral");
        record(controller, "a_pose");
        record(controller, "hand_open", "retry");

        expect(activeState(controller).session.status).toBe("ready_without_hands");
        expect(
            controller.dispatch({ type: "retry", sessionId: "session-a", stepId: "hand_open" }).ok,
        ).toBe(true);
        expect(activeState(controller)).toMatchObject({
            currentStep: "hand_open",
            session: { status: "ready_without_hands" },
        });
    });

    it("cancels lifecycle sessions and rejects callbacks from the invalidated id", () => {
        const controller = new InitialSincroCalibrationController();
        controller.dispatch({ type: "start", sessionId: "session-a", mediaTimeMs: 100 });
        expect(
            controller.dispatch({
                type: "cancel",
                sessionId: "session-a",
                reason: "talk_mode_leave",
            }),
        ).toEqual({
            ok: true,
            state: {
                status: "cancelled",
                reason: "talk_mode_leave",
                previousSessionId: "session-a",
            },
        });
        expect(
            controller.dispatch({
                type: "record",
                sessionId: "session-a",
                result: result("precheck"),
            }),
        ).toMatchObject({ ok: false, reason: "inactive" });
        expect(
            controller.dispatch({ type: "start", sessionId: "session-b", mediaTimeMs: 200 }).ok,
        ).toBe(true);
        const before = controller.getState();
        expect(
            controller.dispatch({
                type: "record",
                sessionId: "session-a",
                result: result("precheck"),
            }),
        ).toEqual({ ok: false, reason: "stale_session", state: before });
    });

    it("does not put session fields on idle or cancelled states", () => {
        const states: InitialSincroCalibrationControllerState[] = [
            new InitialSincroCalibrationController().getState(),
            { status: "cancelled", reason: "vrm_change", previousSessionId: "session-a" },
        ];
        for (const state of states) {
            expect(state).not.toHaveProperty("currentStep");
            expect(state).not.toHaveProperty("session");
        }
    });
});
