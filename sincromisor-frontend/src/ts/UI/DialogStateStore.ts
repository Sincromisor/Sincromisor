export type DialogSettingKey =
    | "talkMode"
    | "titleText"
    | "enableCharacter"
    | "enableTalk"
    | "enableCharacterGaze"
    | "enableAutoMute"
    | "enableNoiseSuppression"
    | "enableEchoCancellation"
    | "enableAutoGainControl"
    | "enableVadGate"
    | "enableVenueNoiseMode"
    | "enableInspector"
    | "enableVR";

type DialogSettingValueMap = {
    talkMode: string;
    titleText: string;
    enableCharacter: boolean;
    enableTalk: boolean;
    enableCharacterGaze: boolean;
    enableAutoMute: boolean;
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    enableVadGate: boolean;
    enableVenueNoiseMode: boolean;
    enableInspector: boolean;
    enableVR: boolean;
};

type DialogSettingDisabledMap = {
    titleText: boolean;
    talkMode: boolean;
    enableCharacter: boolean;
    enableTalk: boolean;
    enableCharacterGaze: boolean;
    enableAutoMute: boolean;
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    enableVadGate: boolean;
    enableVenueNoiseMode: boolean;
    enableInspector: boolean;
    enableVR: boolean;
};

export type DialogUiStateValue = {
    isOpen: boolean;
    startButtonDisabled: boolean;
    startButtonText: string;
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
        enableCharacter: true,
        enableTalk: true,
        enableCharacterGaze: true,
        enableAutoMute: false,
        enableNoiseSuppression: true,
        enableEchoCancellation: true,
        enableAutoGainControl: false,
        enableVadGate: true,
        enableVenueNoiseMode: false,
        enableInspector: false,
        enableVR: false,
    };
    private disabled: DialogSettingDisabledMap = {
        titleText: false,
        talkMode: false,
        enableCharacter: true,
        enableTalk: false,
        enableCharacterGaze: true,
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
        startButtonText: "はじめる",
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
        this.values[key] = value;
    }

    isDisabled(key: keyof DialogSettingDisabledMap): boolean {
        return this.disabled[key];
    }

    setDisabled(key: keyof DialogSettingDisabledMap, disabled: boolean): void {
        this.disabled[key] = disabled;
    }

    getDialogUiState(): DialogUiStateValue {
        return { ...this.dialogUiState };
    }

    setDialogOpen(isOpen: boolean): void {
        this.dialogUiState = { ...this.dialogUiState, isOpen };
    }

    setDialogStartButtonState(startButtonDisabled: boolean, startButtonText: string): void {
        this.dialogUiState = {
            ...this.dialogUiState,
            startButtonDisabled,
            startButtonText,
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
