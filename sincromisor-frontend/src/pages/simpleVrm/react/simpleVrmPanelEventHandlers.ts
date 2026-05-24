import type { Dispatch, SetStateAction } from "react";
import type { SincroAppEvent } from "../../../app/controller";
import { prependPanelMessageLog } from "../../../app/react/panelLogHelpers";
import { UI_TUNING } from "../../../app/react/uiTuning";
import type {
    PanelGazeState,
    PanelLearnedVadState,
    PanelLookingGlassConfigStatus,
    PanelLookingGlassState,
    PanelMessageLog,
    PanelRtcState,
    PanelTelopLog,
} from "./panelTypes";

export type SimpleVrmPanelEventHandlerMap = {
    [K in SincroAppEvent["type"]]?: (event: Extract<SincroAppEvent, { type: K }>) => void;
};

export type SimpleVrmPanelRuntimeEventSetters = {
    setLogs: Dispatch<SetStateAction<PanelMessageLog[]>>;
    setVadState: Dispatch<SetStateAction<"unknown" | "speech" | "silence">>;
    setLearnedVad: Dispatch<SetStateAction<PanelLearnedVadState>>;
    setGaze: Dispatch<SetStateAction<PanelGazeState>>;
    setRtcEvents: Dispatch<SetStateAction<string[]>>;
    setRtcState: Dispatch<SetStateAction<PanelRtcState>>;
    setTelopLogs: Dispatch<SetStateAction<PanelTelopLog[]>>;
    setLookingGlass: Dispatch<SetStateAction<PanelLookingGlassState>>;
    setLookingGlassConfigStatus: Dispatch<SetStateAction<PanelLookingGlassConfigStatus>>;
};

export function createSimpleVrmPanelRuntimeEventHandlers(
    runtimeSetters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        ...createMessageEventHandlers(runtimeSetters),
        ...createRuntimeStatusEventHandlers(runtimeSetters),
        ...createLookingGlassEventHandlers(runtimeSetters),
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
