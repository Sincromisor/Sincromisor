import {
    type InitialCalibrationStepId,
    type InitialCalibrationStepResult,
    type InitialSincroCalibrationSession,
    SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION,
} from "./initialSincroCalibration";
import { summarizeInitialCalibrationSession } from "./initialSincroCalibrationSession";

const CALIBRATION_STEP_ORDER: InitialCalibrationStepId[] = [
    "precheck",
    "neutral",
    "a_pose",
    "hand_open",
];

/**
 * Production calibration retry UI が購読する session lifecycle。
 *
 * idle / cancelled は session data を持たず、cancelled は旧 session id を再利用させないための説明だけを残す。
 */
export type InitialSincroCalibrationControllerState =
    | { status: "idle" }
    | {
          status: "active";
          sessionId: string;
          currentStep: InitialCalibrationStepId;
          session: InitialSincroCalibrationSession;
      }
    | { status: "cancelled"; reason: string; previousSessionId: string };

/** session identity を必須にして stale camera callback と UI 操作を拒否する action contract。 */
export type InitialSincroCalibrationControllerAction =
    | { type: "start"; sessionId: string; mediaTimeMs: number }
    | { type: "record"; sessionId: string; result: InitialCalibrationStepResult }
    | { type: "retry"; sessionId: string; stepId: InitialCalibrationStepId }
    | { type: "cancel"; sessionId: string; reason: string };

export type InitialSincroCalibrationControllerResult =
    | { ok: true; state: InitialSincroCalibrationControllerState }
    | {
          ok: false;
          reason: "stale_session" | "inactive" | "step_missing" | "already_active";
          state: InitialSincroCalibrationControllerState;
      };

/**
 * Initial calibration の記録結果を保持し、step retry の cascade と lifecycle cancellation を所有する。
 *
 * guard failure は state object を置換せず返す。camera stop / mode leave / VRM change の owner は active
 * session id を cancel action に渡し、再開時は別 id で start しなければならない。
 */
export class InitialSincroCalibrationController {
    private static manager: InitialSincroCalibrationController | undefined;
    private state: InitialSincroCalibrationControllerState = { status: "idle" };
    private readonly listeners = new Set<
        (state: InitialSincroCalibrationControllerState) => void
    >();

    static getManager(): InitialSincroCalibrationController {
        InitialSincroCalibrationController.manager ??= new InitialSincroCalibrationController();
        return InitialSincroCalibrationController.manager;
    }

    subscribe(listener: (state: InitialSincroCalibrationControllerState) => void): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    getState(): InitialSincroCalibrationControllerState {
        return this.state;
    }

    dispatch(
        action: InitialSincroCalibrationControllerAction,
    ): InitialSincroCalibrationControllerResult {
        if (action.type === "start") {
            return this.start(action);
        }
        const active = this.activeFor(action.sessionId);
        if (!active.ok) {
            return active;
        }
        if (action.type === "record") {
            return this.record(active.state, action.result);
        }
        if (action.type === "retry") {
            return this.retry(active.state, action.stepId);
        }
        this.state = {
            status: "cancelled",
            reason: action.reason,
            previousSessionId: active.state.sessionId,
        };
        return this.success();
    }

    private start(
        action: Extract<InitialSincroCalibrationControllerAction, { type: "start" }>,
    ): InitialSincroCalibrationControllerResult {
        if (this.state.status === "active") {
            return { ok: false, reason: "already_active", state: this.state };
        }
        this.state = {
            status: "active",
            sessionId: action.sessionId,
            currentStep: "precheck",
            session: {
                schemaVersion: SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION,
                status: "not_started",
                startedAtMediaTimeMs: action.mediaTimeMs,
                steps: {},
                userGuideMessages: [],
                debugReasons: [],
            },
        };
        return this.success();
    }

    private activeFor(sessionId: string):
        | {
              ok: true;
              state: Extract<InitialSincroCalibrationControllerState, { status: "active" }>;
          }
        | Extract<InitialSincroCalibrationControllerResult, { ok: false }> {
        if (this.state.status !== "active") {
            return { ok: false, reason: "inactive", state: this.state };
        }
        if (this.state.sessionId !== sessionId) {
            return { ok: false, reason: "stale_session", state: this.state };
        }
        return { ok: true, state: this.state };
    }

    private record(
        active: Extract<InitialSincroCalibrationControllerState, { status: "active" }>,
        result: InitialCalibrationStepResult,
    ): InitialSincroCalibrationControllerResult {
        const session = summarizeInitialCalibrationSession({
            ...active.session,
            steps: { ...active.session.steps, [result.id]: result },
        });
        const index = CALIBRATION_STEP_ORDER.indexOf(result.id);
        const canAdvance =
            result.status === "ready" ||
            result.status === "degraded" ||
            result.status === "skipped";
        const currentStep = canAdvance
            ? (CALIBRATION_STEP_ORDER[index + 1] ?? result.id)
            : result.id;
        this.state = { ...active, currentStep, session };
        return this.success();
    }

    /**
     * 再試行 step と、その測定値に依存する後続 entry だけを削除する。
     * precheck は全削除、neutral は neutral / a_pose / hand_open、a_pose と hand_open は自身だけを削除する。
     */
    private retry(
        active: Extract<InitialSincroCalibrationControllerState, { status: "active" }>,
        stepId: InitialCalibrationStepId,
    ): InitialSincroCalibrationControllerResult {
        if (active.session.steps[stepId] === undefined) {
            return { ok: false, reason: "step_missing", state: this.state };
        }
        const remove = retryCascade(stepId);
        const steps = { ...active.session.steps };
        for (const id of remove) {
            delete steps[id];
        }
        const session = summarizeInitialCalibrationSession({ ...active.session, steps });
        this.state = { ...active, currentStep: stepId, session };
        return this.success();
    }

    private success(): InitialSincroCalibrationControllerResult {
        for (const listener of this.listeners) {
            listener(this.state);
        }
        return { ok: true, state: this.state };
    }
}

function retryCascade(stepId: InitialCalibrationStepId): Set<InitialCalibrationStepId> {
    if (stepId === "precheck") {
        return new Set(CALIBRATION_STEP_ORDER);
    }
    if (stepId === "neutral") {
        return new Set(["neutral", "a_pose", "hand_open"]);
    }
    return new Set([stepId]);
}
