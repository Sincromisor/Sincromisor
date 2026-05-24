import {
    createDefaultSincroAppSettingsSnapshot,
    createDefaultSincroAppSettingsUiState,
    createDefaultSincroAppStartupSettingsCapabilities,
    createDefaultSincroAppStartupSettingsStatus,
    defaultSincroAppSettingsUiHints,
} from "../../../app/settings/sincroAppSettingsDefaults";
import type {
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
export const defaultSimpleVrmPanelSettings: SincroAppSettingsSnapshot =
    createDefaultSincroAppSettingsSnapshot();

export const defaultSimpleVrmPanelSettingsUiState: SincroAppSettingsUiState =
    createDefaultSincroAppSettingsUiState();

export const defaultSimpleVrmPanelSettingsUiHints: SincroAppSettingsUiHints =
    defaultSincroAppSettingsUiHints;

export const defaultSimpleVrmPanelStartupSettingsStatus: SincroAppStartupSettingsStatus =
    createDefaultSincroAppStartupSettingsStatus();

export const defaultSimpleVrmPanelStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities =
    createDefaultSincroAppStartupSettingsCapabilities();

export const defaultSimpleVrmPanelRtcState: PanelRtcState = {
    iceConnectionState: "-",
    signalingState: "-",
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
