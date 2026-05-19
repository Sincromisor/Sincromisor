import type { Dispatch, SetStateAction } from "react";
import type { SincroAppController } from "../../ts/app/sincroAppController";
import type { SincroAppEvent, SincroAppLifecycleState } from "../../ts/app/sincroAppTypes";
import { prependPanelMessageLog } from "../app/panelLogHelpers";
import {
    hydrateSettingsSnapshotsFromController,
    hydrateStartupSettingsStatusFromController,
} from "../app/sincroAppStateSnapshotHydrators";
import { UI_TUNING } from "../app/uiTuning";
import type {
    PanelConnectionState,
    PanelGazeState,
    PanelLearnedVadState,
    PanelLookingGlassConfigStatus,
    PanelLookingGlassState,
    PanelMessageLog,
    PanelRtcState,
    PanelTelopLog,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./panelTypes";

export type SimpleVrmPanelEventHandlerMap = {
    [K in SincroAppEvent["type"]]?: (event: Extract<SincroAppEvent, { type: K }>) => void;
};

export type SimpleVrmPanelControllerEventSetters = {
    setHasActiveController: Dispatch<SetStateAction<boolean>>;
    setCurrentController: Dispatch<SetStateAction<SincroAppController | undefined>>;
    setLifecycleState: Dispatch<SetStateAction<SincroAppLifecycleState>>;
    setSettings: Dispatch<SetStateAction<SincroAppSettingsSnapshot>>;
    setSettingsUiState: Dispatch<SetStateAction<SincroAppSettingsUiState>>;
    setSettingsUiHints: Dispatch<SetStateAction<SincroAppSettingsUiHints>>;
    setStartupSettingsStatus: Dispatch<SetStateAction<SincroAppStartupSettingsStatus>>;
    setStartupSettingsCapabilities: Dispatch<SetStateAction<SincroAppStartupSettingsCapabilities>>;
};

export type SimpleVrmPanelRuntimeEventSetters = {
    setLogs: Dispatch<SetStateAction<PanelMessageLog[]>>;
    setVadState: Dispatch<SetStateAction<"unknown" | "speech" | "silence">>;
    setLearnedVad: Dispatch<SetStateAction<PanelLearnedVadState>>;
    setGaze: Dispatch<SetStateAction<PanelGazeState>>;
    setRtcEvents: Dispatch<SetStateAction<string[]>>;
    setRtcState: Dispatch<SetStateAction<PanelRtcState>>;
    setConnectionState: Dispatch<SetStateAction<PanelConnectionState>>;
    setTelopLogs: Dispatch<SetStateAction<PanelTelopLog[]>>;
    setLookingGlass: Dispatch<SetStateAction<PanelLookingGlassState>>;
    setLookingGlassConfigStatus: Dispatch<SetStateAction<PanelLookingGlassConfigStatus>>;
};

export function syncSimpleVrmPanelController(
    controller: SincroAppController | undefined,
    setters: SimpleVrmPanelControllerEventSetters,
): void {
    setters.setCurrentController(controller);
    setters.setHasActiveController(!!controller);
    if (!controller) {
        setters.setLifecycleState("idle");
        return;
    }
    hydrateSettingsSnapshotsFromController(controller, setters);
    hydrateStartupSettingsStatusFromController(controller, setters);
}

export function createSimpleVrmPanelEventHandlers(
    controllerSetters: SimpleVrmPanelControllerEventSetters,
    runtimeSetters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        ...createSettingsEventHandlers(controllerSetters),
        ...createMessageEventHandlers(runtimeSetters),
        ...createRuntimeStatusEventHandlers(runtimeSetters),
        ...createLookingGlassEventHandlers(runtimeSetters),
    };
}

function createSettingsEventHandlers(
    setters: SimpleVrmPanelControllerEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        lifecycle: (event) => setters.setLifecycleState(event.state),
        settings_snapshot: (event) =>
            setters.setSettings((prev) => ({ ...prev, ...event.settings })),
        settings_ui_state: (event) => setters.setSettingsUiState(event.uiState),
        settings_ui_hints: (event) => setters.setSettingsUiHints(event.uiHints),
        startup_settings_status: (event) => setters.setStartupSettingsStatus(event.status),
        startup_settings_capabilities: (event) =>
            setters.setStartupSettingsCapabilities(event.capabilities),
    };
}

function createMessageEventHandlers(
    setters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        system_message: (event) => setters.setLogs((prev) => prependPanelMessageLog(prev, event)),
        error_message: (event) => setters.setLogs((prev) => prependPanelMessageLog(prev, event)),
        chat_message: (event) => setters.setLogs((prev) => prependPanelMessageLog(prev, event)),
        rtc_event_log: (event) =>
            setters.setRtcEvents((prev) =>
                [event.message, ...prev].slice(0, UI_TUNING.controlPanel.rtcEventLogLimit),
            ),
        telop_message: (event) =>
            setters.setTelopLogs((prev) =>
                [
                    {
                        text: event.message.text ?? "",
                        message: event.message.message,
                        newText: !!event.message.new_text,
                        vowel: event.message.vowel ?? "",
                    },
                    ...prev,
                ].slice(0, UI_TUNING.controlPanel.telopLogLimit),
            ),
    };
}

function createRuntimeStatusEventHandlers(
    setters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        local_vad_state: (event) => setters.setVadState(event.isSpeech ? "speech" : "silence"),
        gaze_status: (event) =>
            setters.setGaze((prev) => ({
                faceX: event.faceX ?? prev.faceX,
                faceY: event.faceY ?? prev.faceY,
                facing: event.facing ?? prev.facing,
                watching: typeof event.watching === "boolean" ? event.watching : prev.watching,
            })),
        rtc_state: (event) =>
            setters.setRtcState((prev) => ({
                iceConnectionState: event.iceConnectionState ?? prev.iceConnectionState,
                signalingState: event.signalingState ?? prev.signalingState,
            })),
        connection_state: (event) =>
            setters.setConnectionState({ value: event.value, detail: event.detail ?? "" }),
        learned_vad_state: (event) =>
            setters.setLearnedVad({ status: event.status, probability: event.probability }),
    };
}

function createLookingGlassEventHandlers(
    setters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        looking_glass_state: (event) =>
            setters.setLookingGlass({
                state: event.state,
                code: event.code ?? "",
                message: event.message ?? "",
            }),
        looking_glass_config_status: (event) => setters.setLookingGlassConfigStatus(event.status),
    };
}
