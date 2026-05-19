import type {
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigStatus,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../ts/app/sincroAppTypes";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../app/appSettingsTypes";

// Control Panel 表示専用の view-model 型。
// AppController event/snapshot を UI 表示都合（ログ、診断カード、LG状態表示）に整形して保持する。
export type { ApplySettingsFn, SincroAppSettingsSnapshot };

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
    faceX?: number;
    faceY?: number;
    facing?: number;
    watching?: boolean;
};

export type PanelRtcState = {
    iceConnectionState: string;
    signalingState: string;
};

export type PanelLearnedVadState = {
    status: string;
    probability?: number;
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
    // 表示コンポーネントへまとめて渡しやすいよう、頻出 state を集約した読み取り用型。
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

export type {
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
};
