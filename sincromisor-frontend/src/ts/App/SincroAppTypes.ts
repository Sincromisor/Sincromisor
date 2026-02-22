import type { ChatMessage, TelopChannelMessage } from "../RTC/RTCMessage";
import type { DialogPopEvent } from "../UI/PopManager";
import type {
    DialogSettingsUiHints,
    DialogSettingsUiState,
    DialogUiState,
    DialogVrmUiState,
} from "../UI/DialogManager";
import type { LookingGlassRuntimeConfig } from "../SincroVRM/LookingGlass/LookingGlassRuntimeConfig";

export type SincroAppLifecycleState = "idle" | "starting" | "running" | "stopping" | "stopped";

export type SincroAppStartHooks = {
    beforeStart?: () => void;
    afterStart?: () => void;
};

export type SincroAppSettingsSnapshot = {
    titleText: string;
    talkMode: string;
    enableCharacter: boolean;
    enableTalk: boolean;
    enableCharacterGaze: boolean;
    enableAutoMute: boolean;
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    enableVadGate: boolean;
    enableVenueNoiseMode: boolean;
    enableInspector: boolean;
    enableVR: boolean;
    lgTileHeight: number;
    lgNumViews: number;
    lgTargetY: number;
    lgTargetZ: number;
    lgTargetDiam: number;
    lgDepthiness: number;
    lgFovyDeg: number;
};

export type SincroAppSettingsUiState = DialogSettingsUiState;
export type SincroAppSettingsUiHints = DialogSettingsUiHints;
export type SincroAppDialogUiState = DialogUiState;
export type SincroAppDialogVrmUiState = DialogVrmUiState;
export type SincroAppDialogPopMessage = DialogPopEvent;

export type SincroAppStartupSettingsStatus = {
    requiresRestart: boolean;
    willApplyOnNextStart: boolean;
    changedKeys: Array<"enableTalk" | "enableInspector" | "enableVR">;
};

export type SincroAppStartupSettingsCapabilities = {
    enableTalk: boolean;
    enableInspector: boolean;
    enableVR: boolean;
};

export type SincroAppLookingGlassConfigStatus = {
    pendingForNextSession: boolean;
    reloadRecommended: boolean;
    changedKeys: Array<keyof LookingGlassRuntimeConfig>;
    reloadRecommendedKeys: Array<keyof LookingGlassRuntimeConfig>;
    nextSessionKeys: Array<keyof LookingGlassRuntimeConfig>;
};

export type SincroAppLookingGlassEventDetail = {
    state: "idle" | "starting" | "recovering" | "active" | "error";
    code?: "button_not_found" | "webxr_unavailable" | "session_start_failed" | "polyfill_init_failed" | "retry_after_error" | "session_ended";
    message?: string;
};

export type SincroAppLookingGlassConfigUpdatedEventDetail = {
    config: LookingGlassRuntimeConfig;
    changedKeys: Array<keyof LookingGlassRuntimeConfig>;
};

export type SincroAppEvent = {
    type: "lifecycle";
    state: SincroAppLifecycleState;
} | {
    type: "chat_message";
    message: ChatMessage;
} | {
    type: "system_message";
    message: ChatMessage;
} | {
    type: "error_message";
    message: ChatMessage;
} | {
    type: "local_vad_state";
    isSpeech: boolean;
} | {
    type: "gaze_status";
    faceX?: number;
    faceY?: number;
    facing?: number;
    watching?: boolean;
} | {
    type: "rtc_event_log";
    message: string;
} | {
    type: "rtc_state";
    iceConnectionState?: string;
    signalingState?: string;
} | {
    type: "connection_state";
    value: "idle" | "starting" | "connecting" | "connected" | "degraded" | "stopping" | "stopped";
    detail?: string;
} | {
    type: "learned_vad_state";
    status: string;
    probability: number | null;
} | {
    type: "telop_message";
    message: TelopChannelMessage;
} | {
    type: "settings_snapshot";
    settings: SincroAppSettingsSnapshot;
} | {
    type: "settings_ui_state";
    uiState: SincroAppSettingsUiState;
} | {
    type: "settings_ui_hints";
    uiHints: SincroAppSettingsUiHints;
} | {
    type: "dialog_ui_state";
    uiState: SincroAppDialogUiState;
} | {
    type: "dialog_vrm_ui_state";
    uiState: SincroAppDialogVrmUiState;
} | {
    type: "dialog_pop_message";
    message: SincroAppDialogPopMessage;
} | {
    type: "startup_settings_status";
    status: SincroAppStartupSettingsStatus;
} | {
    type: "startup_settings_capabilities";
    capabilities: SincroAppStartupSettingsCapabilities;
} | {
    type: "looking_glass_state";
    state: SincroAppLookingGlassEventDetail["state"];
    code?: SincroAppLookingGlassEventDetail["code"];
    message?: SincroAppLookingGlassEventDetail["message"];
} | {
    type: "looking_glass_config_status";
    status: SincroAppLookingGlassConfigStatus;
};
