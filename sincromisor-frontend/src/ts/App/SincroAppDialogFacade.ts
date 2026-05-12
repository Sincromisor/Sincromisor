import type {
    DialogSettingsUiHints,
    DialogSettingsUiState,
    DialogUiState,
    DialogVrmUiState,
} from "../UI/DialogManager";

// SincroAppController 系 helper が DialogManager に期待する最小インターフェース。
// 具体クラス依存を薄め、snapshot/apply/bridge factory の責務境界を明確化する。
export type SincroAppDialogFacade = {
    applySelectedVrmFile(file: File): void;
    setVrmDragOver(isDragOver: boolean): void;
    closeDialog(): void;
    showDialog(): void;
    updateUserMediaAvailabilityStatus(available: boolean): void;
    updateCharacterStatus(available: boolean): void;
    enableCharacter(): boolean;
    enableVR(): boolean;
    enableInspector(): boolean;
    loadVrmThumbnailBlob(): Promise<Blob | null>;
    saveVrmThumbnailBlob(blob: Blob): Promise<void>;
    getSelectedVrmUrl(): string;

    titleText(): string;
    talkMode(): string;
    audioInputDeviceId(): string | null;
    videoInputDeviceId(): string | null;
    enableTalk(): boolean;
    enableCharacterGaze(): boolean;
    enableSincroPoseTracking(): boolean;
    enableAutoMute(): boolean;
    enableNoiseSuppression(): boolean;
    enableEchoCancellation(): boolean;
    enableAutoGainControl(): boolean;
    enableVadGate(): boolean;
    enableVenueNoiseMode(): boolean;
    characterMotionScale(): number;
    sincroPoseRetargetScale(): number;
    characterEyeTrackingScale(): number;

    setTalkMode(value: string): void;
    setTitleText(value: string): void;
    setAudioInputDeviceId(deviceId: string | null): void;
    setVideoInputDeviceId(deviceId: string | null): void;
    setEnableAutoGainControl(enabled: boolean): void;
    setEnableNoiseSuppression(enabled: boolean): void;
    setEnableEchoCancellation(enabled: boolean): void;
    setEnableVadGate(enabled: boolean): void;
    setEnableVenueNoiseMode(enabled: boolean): void;
    setEnableCharacter(enabled: boolean): void;
    setEnableTalk(enabled: boolean): void;
    setEnableCharacterGaze(enabled: boolean): void;
    setEnableSincroPoseTracking(enabled: boolean): void;
    setEnableAutoMute(enabled: boolean): void;
    setEnableInspector(enabled: boolean): void;
    setEnableVR(enabled: boolean): void;
    setCharacterMotionScale(value: number): void;
    setSincroPoseRetargetScale(value: number): void;
    setCharacterEyeTrackingScale(value: number): void;

    settingsUiState(): DialogSettingsUiState;
    settingsUiHints(): DialogSettingsUiHints;
    getDialogUiState(): DialogUiState;
    getVrmUiState(): DialogVrmUiState;

    subscribeSettingsChange(listener: () => void): () => void;
    subscribeDialogUiState(listener: (uiState: DialogUiState) => void): () => void;
    subscribeVrmUiState(listener: (uiState: DialogVrmUiState) => void): () => void;
};
