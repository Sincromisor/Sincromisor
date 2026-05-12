export type DialogSettingKey =
    | "talkMode"
    | "titleText"
    | "audioInputDeviceId"
    | "videoInputDeviceId"
    | "enableCharacter"
    | "enableTalk"
    | "enableCharacterGaze"
    | "enableSincroPoseTracking"
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

// DialogStateStore 内で保持する設定値の型マップ。
// DialogManager の generic getter/setter から key-safe に扱うために定義している。
type DialogSettingValueMap = {
    talkMode: string;
    titleText: string;
    audioInputDeviceId: string | null;
    videoInputDeviceId: string | null;
    enableCharacter: boolean;
    enableTalk: boolean;
    enableCharacterGaze: boolean;
    enableSincroPoseTracking: boolean;
    enableAutoMute: boolean;
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    enableVadGate: boolean;
    enableVenueNoiseMode: boolean;
    enableInspector: boolean;
    enableVR: boolean;
    characterMotionScale: number;
    sincroPoseRetargetScale: number;
    characterEyeTrackingScale: number;
};

type DialogSettingDisabledMap = {
    titleText: boolean;
    talkMode: boolean;
    audioInputDeviceId: boolean;
    videoInputDeviceId: boolean;
    enableCharacter: boolean;
    enableTalk: boolean;
    enableCharacterGaze: boolean;
    enableSincroPoseTracking: boolean;
    enableAutoMute: boolean;
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    enableVadGate: boolean;
    enableVenueNoiseMode: boolean;
    enableInspector: boolean;
    enableVR: boolean;
};

// React dialog 側で直接使う UI 状態（表示/開始ボタン）を store 側でも保持する。
export type DialogUiStateValue = {
    isOpen: boolean;
    startButtonDisabled: boolean;
    startButtonText: string;
    startButtonHint: string | null;
};

export type DialogVrmUiStateValue = {
    isDragOver: boolean;
    vrmStatusText: string;
};

// DialogManager の getter/setter を DOM 直読みに依存させすぎないための軽量 state store。
// bridge DOM は同期先として残し、React/UI 層はこの値を間接的に使う構成へ寄せる。
export class DialogStateStore {
    private values: DialogSettingValueMap = {
        talkMode: "chat",
        titleText: "Sincromisor",
        audioInputDeviceId: null,
        videoInputDeviceId: null,
        enableCharacter: true,
        enableTalk: true,
        enableCharacterGaze: true,
        enableSincroPoseTracking: true,
        enableAutoMute: false,
        enableNoiseSuppression: true,
        enableEchoCancellation: true,
        enableAutoGainControl: false,
        enableVadGate: true,
        enableVenueNoiseMode: false,
        enableInspector: false,
        enableVR: false,
        characterMotionScale: 0.72,
        sincroPoseRetargetScale: 0.68,
        characterEyeTrackingScale: 0.68,
    };
    private disabled: DialogSettingDisabledMap = {
        titleText: false,
        talkMode: false,
        audioInputDeviceId: false,
        videoInputDeviceId: false,
        enableCharacter: true,
        enableTalk: false,
        enableCharacterGaze: true,
        enableSincroPoseTracking: false,
        enableAutoMute: true,
        enableNoiseSuppression: false,
        enableEchoCancellation: false,
        enableAutoGainControl: false,
        enableVadGate: false,
        enableVenueNoiseMode: false,
        enableInspector: false,
        enableVR: false,
    };
    private dialogUiState: DialogUiStateValue = {
        isOpen: false,
        startButtonDisabled: false,
        startButtonText: "開始する",
        startButtonHint: null,
    };
    private dialogVrmUiState: DialogVrmUiStateValue = {
        isDragOver: false,
        vrmStatusText: "既定のVRMモデルを使用中",
    };
    private selectedVrmUrl: string = "/characters/default.vrm";

    get<K extends DialogSettingKey>(key: K): DialogSettingValueMap[K] {
        return this.values[key];
    }

    set<K extends DialogSettingKey>(key: K, value: DialogSettingValueMap[K]): void {
        // store は純粋な状態保持に徹し、通知は DialogManager/EventHub 側で行う。
        this.values[key] = value;
    }

    isDisabled(key: keyof DialogSettingDisabledMap): boolean {
        return this.disabled[key];
    }

    setDisabled(key: keyof DialogSettingDisabledMap, disabled: boolean): void {
        this.disabled[key] = disabled;
    }

    getDialogUiState(): DialogUiStateValue {
        // 外部からの破壊的変更を避けるため snapshot を返す。
        return { ...this.dialogUiState };
    }

    setDialogOpen(isOpen: boolean): void {
        this.dialogUiState = { ...this.dialogUiState, isOpen };
    }

    setDialogStartButtonState(startButtonDisabled: boolean, startButtonText: string, startButtonHint: string | null = null): void {
        this.dialogUiState = {
            ...this.dialogUiState,
            startButtonDisabled,
            startButtonText,
            startButtonHint,
        };
    }

    getDialogVrmUiState(): DialogVrmUiStateValue {
        return { ...this.dialogVrmUiState };
    }

    setDialogVrmDragOver(isDragOver: boolean): void {
        this.dialogVrmUiState = { ...this.dialogVrmUiState, isDragOver };
    }

    setDialogVrmStatusText(vrmStatusText: string): void {
        this.dialogVrmUiState = { ...this.dialogVrmUiState, vrmStatusText };
    }

    getSelectedVrmUrl(): string {
        return this.selectedVrmUrl;
    }

    setSelectedVrmUrl(vrmUrl: string): void {
        this.selectedVrmUrl = vrmUrl;
    }
}
