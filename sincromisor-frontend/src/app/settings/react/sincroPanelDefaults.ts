import {
    createDefaultSincroAppSettingsSnapshot,
    createDefaultSincroAppSettingsUiState,
    createDefaultSincroAppStartupSettingsCapabilities,
    createDefaultSincroAppStartupSettingsStatus,
    defaultSincroAppSettingsUiHints,
} from "../sincroAppSettingsDefaults";
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
export const defaultSincroPanelSettings: SincroAppSettingsSnapshot =
    createDefaultSincroAppSettingsSnapshot();

export const defaultSincroPanelSettingsUiState: SincroAppSettingsUiState =
    createDefaultSincroAppSettingsUiState();

export const defaultSincroPanelSettingsUiHints: SincroAppSettingsUiHints =
    defaultSincroAppSettingsUiHints;

export const defaultSincroPanelStartupSettingsStatus: SincroAppStartupSettingsStatus =
    createDefaultSincroAppStartupSettingsStatus();

export const defaultSincroPanelStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities =
    createDefaultSincroAppStartupSettingsCapabilities();

export const defaultSincroPanelRtcState: PanelRtcState = {
    iceConnectionState: "-",
    signalingState: "-",
};

export const defaultSincroPanelLookingGlassState: PanelLookingGlassState = {
    state: "idle",
    code: "",
    message: "",
};

export const defaultSincroPanelLookingGlassConfigStatus: PanelLookingGlassConfigStatus = {
    pendingForNextSession: false,
    reloadRecommended: false,
    changedKeys: [],
    reloadRecommendedKeys: [],
    nextSessionKeys: [],
};
