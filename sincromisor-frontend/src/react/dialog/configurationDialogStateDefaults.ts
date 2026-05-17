import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../ts/App/SincroAppTypes";
import type {
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../app/appSettingsTypes";

export type ConfigurationDialogConnectionState = {
    value: "idle" | "starting" | "connecting" | "connected" | "degraded" | "stopping" | "stopped";
    detail: string;
};

export const defaultSettings: SincroAppSettingsSnapshot = {
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

export const defaultSettingsUiState: SincroAppSettingsUiState = {
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

export const defaultDialogVrmUiState: SincroAppDialogVrmUiState = {
    isDragOver: false,
    vrmStatusText: "既定のVRMモデルを使用中",
};

export const defaultDialogUiState: SincroAppDialogUiState = {
    isOpen: false,
    startButtonDisabled: false,
    startButtonText: "開始する",
};

export const defaultSettingsUiHints: SincroAppSettingsUiHints = {};

export const defaultStartupSettingsStatus: SincroAppStartupSettingsStatus = {
    requiresRestart: false,
    willApplyOnNextStart: false,
    changedKeys: [],
};

export const defaultStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities = {
    enableTalk: false,
    enableInspector: false,
    enableVR: false,
};

export const defaultConnectionState: ConfigurationDialogConnectionState = {
    value: "idle",
    detail: "",
};
