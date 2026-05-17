import type {
    PanelConnectionState,
    PanelLookingGlassConfigStatus,
    PanelLookingGlassState,
    PanelRtcState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./panelTypes";

// AppController の初回 snapshot が届く前に control panel が表示する安全な既定値。
export const defaultSimpleVrmPanelSettings: SincroAppSettingsSnapshot = {
    titleText: "Sincromisor",
    talkMode: "chat",
    audioInputDeviceId: undefined,
    videoInputDeviceId: undefined,
    enableCharacter: true,
    enableTalk: true,
    enableCharacterGaze: true,
    enableSincroPoseTracking: true,
    forceSincroPoseTracking: false,
    enableAutoMute: false,
    enableNoiseSuppression: true,
    enableEchoCancellation: true,
    enableAutoGainControl: false,
    enableVadGate: false,
    enableVenueNoiseMode: false,
    enableInspector: false,
    enableVR: false,
    characterMotionScale: 0.72,
    sincroPoseRetargetScale: 0.68,
    characterEyeTrackingScale: 0.68,
    lgTileHeight: 512,
    lgNumViews: 45,
    lgTargetY: 0.95,
    lgTargetZ: 0.05,
    lgTargetDiam: 1.25,
    lgDepthiness: 0.85,
    lgFovyDeg: 24,
};

export const defaultSimpleVrmPanelSettingsUiState: SincroAppSettingsUiState = {
    titleTextDisabled: false,
    talkModeDisabled: false,
    audioInputDeviceDisabled: false,
    videoInputDeviceDisabled: false,
    enableCharacterDisabled: false,
    enableTalkDisabled: false,
    enableCharacterGazeDisabled: false,
    forceSincroPoseTrackingDisabled: false,
    enableAutoMuteDisabled: false,
    enableNoiseSuppressionDisabled: false,
    enableEchoCancellationDisabled: false,
    enableAutoGainControlDisabled: false,
    enableVadGateDisabled: false,
    enableVenueNoiseModeDisabled: false,
    enableInspectorDisabled: false,
    enableVRDisabled: false,
};

export const defaultSimpleVrmPanelSettingsUiHints: SincroAppSettingsUiHints = {};

export const defaultSimpleVrmPanelStartupSettingsStatus: SincroAppStartupSettingsStatus = {
    requiresRestart: false,
    willApplyOnNextStart: false,
    changedKeys: [],
};

export const defaultSimpleVrmPanelStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities =
    {
        enableTalk: false,
        enableInspector: false,
        enableVR: false,
    };

export const defaultSimpleVrmPanelRtcState: PanelRtcState = {
    iceConnectionState: "-",
    signalingState: "-",
};

export const defaultSimpleVrmPanelConnectionState: PanelConnectionState = {
    value: "idle",
    detail: "",
};

export const defaultSimpleVrmPanelLookingGlassState: PanelLookingGlassState = {
    state: "idle",
    code: "",
    message: "",
};

export const defaultSimpleVrmPanelLookingGlassConfigStatus: PanelLookingGlassConfigStatus = {
    pendingForNextSession: false,
    reloadRecommended: false,
    changedKeys: [],
    reloadRecommendedKeys: [],
    nextSessionKeys: [],
};
