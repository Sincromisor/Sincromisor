import type {
    ApplySettingsFn,
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigStatus,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../controller";

// アプリのイベントとスナップショットを、診断カードとLooking Glass状態の表示へ整形する。
export type { ApplySettingsFn, SincroAppSettingsSnapshot };

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

export type SincroPanelViewState = {
    // 表示コンポーネントへまとめて渡しやすいよう、頻出 state を集約した読み取り用型。
    lifecycleState: SincroAppLifecycleState;
    connectionState: PanelConnectionState;
    settings: SincroAppSettingsSnapshot;
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
