import type { LookingGlassRuntimeConfig } from "../../character/lookingGlass/lookingGlassRuntimeConfig";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";

/** 通常設定モデルが所有するキー。別所有のLooking Glass実行時設定を除く。 */
export type SincroAppSettingKey =
    | "talkMode"
    | "titleText"
    | "audioInputDeviceId"
    | "videoInputDeviceId"
    | "enableCharacter"
    | "enableTalk"
    | "enableCharacterGaze"
    | "enableSincroPoseTracking"
    | "forceSincroPoseTracking"
    | "enableAutoMute"
    | "enableNoiseSuppression"
    | "enableEchoCancellation"
    | "enableAutoGainControl"
    | "enableVadGate"
    | "enableVenueNoiseMode"
    | "enableInspector"
    | "enableVR"
    | "characterMotionScale"
    | "sincroPoseRetargetScale"
    | "characterEyeTrackingScale";

/** 通常設定モデルの値。公開スナップショットと同じキーの型を使う。 */
export type SincroAppSettings = Pick<SincroAppSettingsSnapshot, SincroAppSettingKey>;

export type SincroAppNumericSettingKey =
    | "characterMotionScale"
    | "sincroPoseRetargetScale"
    | "characterEyeTrackingScale"
    | "lgTileHeight"
    | "lgNumViews"
    | "lgTargetY"
    | "lgTargetZ"
    | "lgTargetDiam"
    | "lgDepthiness"
    | "lgFovyDeg";

type SincroAppNumericSettingConstraints = {
    min: number;
    max: number;
    step: number;
};

export const defaultSincroAppLookingGlassRuntimeConfig: LookingGlassRuntimeConfig = {
    tileHeight: 512,
    numViews: 45,
    // 展示用の縦長画角で全身を収めやすいよう、既定値はやや下寄りにする。
    targetY: 0.85,
    // 展示実機で焦点が合いやすかった値をベースに、全身が入りやすいよう少し引く。
    targetZ: 0.2,
    targetDiam: 1.5,
    depthiness: 0.85,
    fovyDeg: 24,
};

/** 初回起動と保存値のない設定に使う通常設定の既定値。 */
export const defaultSincroAppSettings: SincroAppSettings = {
    talkMode: "chat",
    titleText: "Sincromisor",
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
    // 初回利用時に誤検出で音声が途切れないよう、ローカル VAD gate は明示 opt-in にする。
    enableVadGate: false,
    enableVenueNoiseMode: false,
    enableInspector: false,
    enableVR: false,
    characterMotionScale: 0.72,
    sincroPoseRetargetScale: 0.68,
    characterEyeTrackingScale: 0.68,
};

export const defaultSincroAppSettingsSnapshot: SincroAppSettingsSnapshot = {
    ...defaultSincroAppSettings,
    lgTileHeight: defaultSincroAppLookingGlassRuntimeConfig.tileHeight,
    lgNumViews: defaultSincroAppLookingGlassRuntimeConfig.numViews,
    lgTargetY: defaultSincroAppLookingGlassRuntimeConfig.targetY,
    lgTargetZ: defaultSincroAppLookingGlassRuntimeConfig.targetZ,
    lgTargetDiam: defaultSincroAppLookingGlassRuntimeConfig.targetDiam,
    lgDepthiness: defaultSincroAppLookingGlassRuntimeConfig.depthiness,
    lgFovyDeg: defaultSincroAppLookingGlassRuntimeConfig.fovyDeg,
};

export const defaultSincroAppSettingsUiState: SincroAppSettingsUiState = {
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

export const defaultSincroAppSettingsUiHints: SincroAppSettingsUiHints = {};

export const defaultSincroAppStartupSettingsStatus: SincroAppStartupSettingsStatus = {
    requiresRestart: false,
    willApplyOnNextStart: false,
    changedKeys: [],
};

export const defaultSincroAppStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities = {
    enableTalk: false,
    enableInspector: false,
    enableVR: false,
};

export const defaultSincroAppDialogUiState: SincroAppDialogUiState = {
    isOpen: false,
    startButtonDisabled: false,
    startButtonText: "開始する",
};

export const defaultSincroAppDialogVrmUiState: SincroAppDialogVrmUiState = {
    isDragOver: false,
    vrmStatusText: "既定のVRMモデルを使用中",
};

/** 機器とページの利用可否が届く前の操作制限。設定モデルの初期状態に使う。 */
export const defaultSincroAppSettingsDisabledState: Record<SincroAppSettingKey, boolean> = {
    titleText: false,
    talkMode: false,
    audioInputDeviceId: false,
    videoInputDeviceId: false,
    // Character/Gaze/AutoMute は runtime controller から利用可否が届くまで無効として扱う。
    enableCharacter: true,
    enableTalk: false,
    enableCharacterGaze: true,
    enableSincroPoseTracking: false,
    forceSincroPoseTracking: false,
    enableAutoMute: true,
    enableNoiseSuppression: false,
    enableEchoCancellation: false,
    enableAutoGainControl: false,
    enableVadGate: false,
    enableVenueNoiseMode: false,
    enableInspector: false,
    enableVR: false,
    characterMotionScale: false,
    sincroPoseRetargetScale: false,
    characterEyeTrackingScale: false,
};

export const sincroAppNumericSettingConstraints: Record<
    SincroAppNumericSettingKey,
    SincroAppNumericSettingConstraints
> = {
    characterMotionScale: { min: 0, max: 1.2, step: 0.05 },
    sincroPoseRetargetScale: { min: 0, max: 1.2, step: 0.05 },
    characterEyeTrackingScale: { min: 0, max: 1.2, step: 0.05 },
    lgTileHeight: { min: 256, max: 2048, step: 1 },
    lgNumViews: { min: 8, max: 64, step: 1 },
    lgTargetY: { min: -2, max: 4, step: 0.05 },
    lgTargetZ: { min: -1, max: 2, step: 0.05 },
    lgTargetDiam: { min: 0.1, max: 3, step: 0.05 },
    lgDepthiness: { min: 0, max: 4, step: 0.05 },
    lgFovyDeg: { min: 5, max: 80, step: 0.5 },
};

export function createDefaultSincroAppSettingsSnapshot(): SincroAppSettingsSnapshot {
    return { ...defaultSincroAppSettingsSnapshot };
}

/** 各設定モデルへ独立した既定値のコピーを渡す。 */
export function createDefaultSincroAppSettings(): SincroAppSettings {
    return { ...defaultSincroAppSettings };
}

export function createDefaultSincroAppSettingsUiState(): SincroAppSettingsUiState {
    return { ...defaultSincroAppSettingsUiState };
}

export function createDefaultSincroAppStartupSettingsStatus(): SincroAppStartupSettingsStatus {
    return {
        ...defaultSincroAppStartupSettingsStatus,
        changedKeys: [...defaultSincroAppStartupSettingsStatus.changedKeys],
    };
}

export function createDefaultSincroAppStartupSettingsCapabilities(): SincroAppStartupSettingsCapabilities {
    return { ...defaultSincroAppStartupSettingsCapabilities };
}
