import type {
    SincroAppLifecycleState,
    SincroAppStartupSettingsStatus,
    SincroAppStartupSettingsCapabilities,
    SincroAppLookingGlassConfigStatus,
} from "../../ts/App/SincroAppTypes";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../app/appSettingsTypes";

export type { ApplySettingsFn };
export type { SincroAppSettingsSnapshot };

export type PanelMessageLogKind = "chat_message" | "system_message" | "error_message";

export type PanelMessageLog = {
    kind: PanelMessageLogKind;
    text: string;
};

export type PanelTelopLog = {
    text: string;
    message: string;
    newText: boolean;
    vowel: string;
};

export type PanelGazeState = {
    faceX: number | null;
    faceY: number | null;
    facing: number | null;
    watching: boolean | null;
};

export type PanelRtcState = {
    iceConnectionState: string;
    signalingState: string;
};

export type PanelLearnedVadState = {
    status: string;
    probability: number | null;
};

export type PanelConnectionState = {
    value: "idle" | "starting" | "connecting" | "connected" | "degraded" | "stopping" | "stopped";
    detail: string;
};

export type PanelLookingGlassState = {
    state: "idle" | "starting" | "recovering" | "active" | "error";
    code: string;
    message: string;
};

// AppController が算出した「LG設定の反映タイミング」情報を表示用にそのまま受ける。
export type PanelLookingGlassConfigStatus = SincroAppLookingGlassConfigStatus;

export type SimpleVrmPanelViewState = {
    lifecycleState: SincroAppLifecycleState;
    connectionState: PanelConnectionState;
    settings: SincroAppSettingsSnapshot;
    logs: PanelMessageLog[];
    telopLogs: PanelTelopLog[];
    rtcEvents: string[];
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcState: PanelRtcState;
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
};

export type { SincroAppSettingsUiState };
export type { SincroAppSettingsUiHints };
export type { SincroAppStartupSettingsStatus };
export type { SincroAppStartupSettingsCapabilities };
